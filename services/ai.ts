import { GoogleGenAI, Type } from "@google/genai";
import { BillType } from "../types";
import { db } from "./db";
import { v4 as uuidv4 } from 'uuid';

export interface ScannedBillData {
  type: BillType;
  suggestedName: string;
  periods: {
    startDate: string;
    endDate: string;
    usageCost: number;
  }[];
  supplyCost: number;
  sewerageCost: number;
}

export async function analyzeBillImage(base64Image: string): Promise<ScannedBillData> {
  // strip header if present (e.g. "data:image/jpeg;base64,")
  const base64Data = base64Image.split(',')[1] || base64Image;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', 
              data: base64Data
            }
          },
          {
            text: `Analyze this utility bill image and extract the following information in JSON format:
            1. Bill Type: Must be one of "ELECTRICITY", "GAS", or "WATER".
            2. Suggested Name: A short name like "Nov Electricity" or "Q3 Water".
            3. Periods: A list of usage periods found. For each, extract start date (YYYY-MM-DD), end date (YYYY-MM-DD), and usage cost (number). 
               - If there are multiple usage blocks/steps for the same date range, sum their costs into one period. 
               - If there are distinct date ranges (common in Water bills), list them as separate periods.
            4. Supply Cost: Total fixed supply or service charges.
            5. Sewerage Cost: Total sewerage charges (if applicable, usually Water).
            
            If a field is not found, use 0 or reasonable defaults.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { 
              type: Type.STRING, 
              enum: ["ELECTRICITY", "GAS", "WATER"],
              description: "The type of utility bill"
            },
            suggestedName: { 
              type: Type.STRING,
              description: "A short, descriptive name for the bill"
            },
            periods: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                  endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                  usageCost: { type: Type.NUMBER, description: "Total usage cost for this period" }
                }
              }
            },
            supplyCost: { type: Type.NUMBER, description: "Total supply/service charge" },
            sewerageCost: { type: Type.NUMBER, description: "Total sewerage charge" }
          },
          required: ["type", "periods", "supplyCost", "sewerageCost"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const result = JSON.parse(text) as ScannedBillData;

    // Log success
    await db.saveAILog({
      id: uuidv4(),
      timestamp: Date.now(),
      billType: result.type,
      status: 'SUCCESS',
      details: `Scanned ${result.suggestedName} successfully`
    });

    return result;

  } catch (error) {
    // Log failure
    await db.saveAILog({
      id: uuidv4(),
      timestamp: Date.now(),
      billType: 'UNKNOWN',
      status: 'FAILED',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
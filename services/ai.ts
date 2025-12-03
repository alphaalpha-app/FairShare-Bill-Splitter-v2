
import { BillType, AIModelProvider } from "../types";
import { db } from "./db";
import { AuthService } from "./auth";
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

export async function analyzeBillImage(base64Image: string, model: AIModelProvider = 'gemini'): Promise<ScannedBillData> {
  // Check auth first
  const token = await AuthService.getToken();
  if (!token) {
    throw new Error("Please log in settings to use AI features.");
  }

  const API_URL = AuthService.getApiUrl();

  try {
    const response = await fetch(`${API_URL}/api/ai/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        image: base64Image,
        model: model
      })
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(errorData.error || `AI Request Failed: ${response.statusText}`);
    }

    const result = await response.json() as ScannedBillData;

    // Log success
    await db.saveAILog({
      id: uuidv4(),
      timestamp: Date.now(),
      billType: result.type,
      status: 'SUCCESS',
      details: `Scanned ${result.suggestedName} successfully`,
      model: model
    });

    return result;

  } catch (error) {
    // Log failure
    await db.saveAILog({
      id: uuidv4(),
      timestamp: Date.now(),
      billType: 'UNKNOWN',
      status: 'FAILED',
      details: error instanceof Error ? error.message : 'Unknown error',
      model: model
    });
    throw error;
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { GENERATE_SKELETON_PROMPT, COMPARE_POSE_SYSTEM_INSTRUCTION } from "../constants";
import { ComparisonResult } from "../types";

// Initialize Gemini Client
// Assuming process.env.API_KEY is available as per instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the target wireframe image using Gemini 2.5 Flash Image.
 */
export const generateTargetPoseImage = async (poseDescription: string, complexity: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: GENERATE_SKELETON_PROMPT(poseDescription, complexity) }],
      },
      config: {
        // We let the model decide aspects, but we prompt heavily for ratio/style
        // Note: aspect ratio param in config is limited, so we rely on prompt for resolution guidance
        // but can force 4:3 roughly by using standard generation.
      }
    });

    // Extract image from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Error generating pose:", error);
    throw error;
  }
};

/**
 * Compares the user's webcam frame with the target wireframe.
 * Uses Gemini 2.5 Flash for multimodal analysis.
 */
export const comparePoses = async (
  targetImageBase64: string,
  userImageBase64: string
): Promise<ComparisonResult> => {
  try {
    // Clean base64 strings
    const cleanTarget = targetImageBase64.split(',')[1];
    const cleanUser = userImageBase64.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: "Target Skeleton:" },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanTarget
            }
          },
          { text: "User Webcam:" },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanUser
            }
          },
          { text: "Compare and score the similarity." }
        ]
      },
      config: {
        systemInstruction: COMPARE_POSE_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: "Similarity score 0-100" },
            feedback: { type: Type.STRING, description: "Short advice, e.g. 'Raise left arm'" }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      score: result.score || 0,
      feedback: result.feedback || "Adjust your pose."
    };

  } catch (error) {
    console.error("Error comparing poses:", error);
    // Fallback in case of API error to avoid game lock
    return { score: 0, feedback: "Comparison error, try again." };
  }
};
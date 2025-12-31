
import { GoogleGenAI, Type } from "@google/genai";
import { EventType, GeminiEventResponse, EventLocation } from "../types.ts";

export const generateEventIdeas = async (
  month: string, 
  type: EventType, 
  userProvidedName?: string,
  usedIcons: string[] = []
): Promise<GeminiEventResponse> => {
  // On récupère la clé de manière sécurisée sans planter si process est undefined
  const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
  
  // Si pas de clé, on utilise directement le fallback pour ne pas faire attendre l'utilisateur
  if (!apiKey) {
    console.warn("API_KEY manquante. Utilisation du mode sans IA.");
    return {
      title: userProvidedName || `${type} de ${month}`,
      date: `Le 15 ${month}`,
      description: "Événement créé en mode local (IA non configurée).",
      icon: "📅",
      maxParticipants: 4
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const basePrompt = userProvidedName 
    ? `L'utilisateur veut organiser un événement nommé "${userProvidedName}" pour le mois de ${month} de type "${type}".`
    : `Génère une idée d'événement créative pour le mois de ${month} de type "${type}".`;

  const exclusionPrompt = usedIcons.length > 0 
    ? `IMPORTANT : Ne choisis PAS un émoji parmi la liste suivante : ${usedIcons.join(', ')}.`
    : '';

  const prompt = `${basePrompt} 
    Propose une date précise, une description attrayante (2 phrases max), un émoji unique, et un nombre de participants (4 par défaut). 
    ${exclusionPrompt}
    Réponds uniquement au format JSON pur.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            date: { type: Type.STRING },
            description: { type: Type.STRING },
            icon: { type: Type.STRING },
            maxParticipants: { type: Type.INTEGER }
          },
          required: ["title", "date", "description", "icon", "maxParticipants"],
        },
      },
    });

    const text = response.text || "{}";
    const cleanedJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanedJson);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return {
      title: userProvidedName || `${type} de ${month}`,
      date: `Le 15 ${month}`,
      description: "Un événement généré faute de réponse de l'IA.",
      icon: "📅",
      maxParticipants: 4
    };
  }
};

export const suggestLocation = async (eventTitle: string, month: string): Promise<EventLocation | undefined> => {
  const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;
  if (!apiKey) return { name: "Lieu à définir" };

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Propose un lieu précis pour l'événement "${eventTitle}" en ${month}.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const mapsChunk = groundingChunks?.find(chunk => chunk.maps);

    if (mapsChunk) {
      return {
        name: mapsChunk.maps.title || "Lieu suggéré",
        mapsUri: mapsChunk.maps.uri
      };
    }
  } catch (error) {
    console.warn("Location suggestion error:", error);
  }
  return { name: "Lieu à définir" };
};

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `Eres Social Banana, el agente de redes sociales de Phaedra (@phaedrasound en Instagram).
Hablas en español, informal pero profesional. Eres directo, con personalidad, como un community manager real.

Phaedra es un DAW (Digital Audio Workstation) open-source y gratuito basado en Ardour.
- Release actual: Phaedra Lite v0.1.0-preview.5 (Windows/Linux), preview.4 (macOS)
- Web: phaedra.com.es
- Discord: discord.phaedra.com.es
- WhatsApp: family.phaedra.com.es

REGLAS:
- NUNCA anuncies features que no existan
- NUNCA menciones @ny0b3 ni lo conectes con @phaedrasound
- Responde con datos reales cuando te los dan
- Si no tienes datos, dilo honestamente
- Maximo 500 caracteres por mensaje
- No uses emojis excesivos, maximo 2-3 por mensaje
- Cuando te den datos de Instagram, analiza y sugiere acciones concretas
- Si te piden algo que no puedes hacer (publicar, crear contenido), di que lo apuntas para la proxima sesion de Claude`;

export async function chat(userMessage, context) {
  if (!OPENAI_KEY) {
    return "No tengo la API key de ChatGPT configurada. Configura OPENAI_API_KEY en las variables de entorno de Render.";
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Datos actuales de Instagram @phaedrasound:\n${JSON.stringify(context, null, 2)}`,
    });
  }

  messages.push({ role: "user", content: userMessage });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 300,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI error:", res.status, err);
    return "Uf, no me pude conectar con el cerebro. Revisa la API key de OpenAI.";
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No se que decirte, algo fallo.";
}

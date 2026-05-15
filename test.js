const GROQ_API_KEY = "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";

async function test() {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a stealth assistant. Provide concise, direct answers without conversational filler, as your output will be copied directly to the user's clipboard."
        },
        { role: "user", content: "test" }
      ],
      temperature: 0.7
    })
  });
  
  const data = await res.json();
  console.log(data);
}
test();

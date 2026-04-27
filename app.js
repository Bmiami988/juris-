// Wait for DOM to fully load before running
document.addEventListener('DOMContentLoaded', function() {
  const API_URL = "https://ug-legal-ai.fastapicloud.dev/ask";
  
  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");
  
  // Check if elements exist
  if (!chatBox) console.error("chat-box not found");
  if (!input) console.error("input not found");
  if (!sendBtn) console.error("sendBtn not found");
  
  // Persistent session
  let session_id = localStorage.getItem("session_id");
  if (!session_id) {
    session_id = crypto.randomUUID().slice(0, 8);
    localStorage.setItem("session_id", session_id);
  }
  
  console.log("Session ID:", session_id);
  
  // Auto-resize textarea
  function autoResize() {
    if (input) {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 150) + "px";
    }
  }
  
  if (input) {
    input.addEventListener("input", autoResize);
    
    // Enter to send (Shift+Enter = newline)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }
  
  function appendMessage(text, sender, isHtml = false) {
    if (!chatBox) return;
    
    const msg = document.createElement("div");
    msg.className = `message ${sender}`;
    if (isHtml) {
      msg.innerHTML = text;
    } else {
      msg.innerHTML = formatText(text);
    }
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msg;
  }
  
  function formatText(text) {
    if (!text) return "";
    return text.replace(/\n/g, "<br>");
  }
  
  function showTyping() {
    if (!chatBox) return;
    
    removeTyping();
    const typingDiv = document.createElement("div");
    typingDiv.id = "typingIndicator";
    typingDiv.className = "message bot typing";
    typingDiv.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Thinking...';
    chatBox.appendChild(typingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  
  function removeTyping() {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
  }
  
  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  
  async function sendMessage() {
    if (!input || !sendBtn || !chatBox) return;
    
    const question = input.value.trim();
    if (!question) {
      console.log("No question entered");
      return;
    }
    
    console.log("Sending question:", question);
    
    // Disable UI
    sendBtn.disabled = true;
    input.disabled = true;
    
    // Add user message
    appendMessage(question, "user");
    
    // Clear input
    input.value = "";
    autoResize();
    
    // Show typing indicator
    showTyping();
    
    try {
      console.log("Making API request to:", API_URL);
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          question: question,
          session_id: session_id
        })
      });
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("API Response:", data);
      
      removeTyping();
      
      // Bot main answer
      let botReply = data.response || "I'm sorry, I couldn't process that request.";
      appendMessage(botReply, "bot");
      
      // Append sources if present
      if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
        let sourcesHtml = `<div class="sources"><i class="fas fa-database"></i> <strong>References:</strong>`;
        data.sources.forEach(src => {
          let sourceName = src.source || src.title || "Legal source";
          let contentSnippet = src.content || src.text || "";
          if (contentSnippet.length > 150) contentSnippet = contentSnippet.substring(0, 150) + "…";
          sourcesHtml += `
            <div class="source">
              <b>📚 ${escapeHtml(sourceName)}</b><br/>
              <small>${escapeHtml(contentSnippet)}</small>
            </div>
          `;
        });
        sourcesHtml += `</div>`;
        appendMessage(sourcesHtml, "bot", true);
      }
      
    } catch (err) {
      console.error("Error details:", err);
      removeTyping();
      
      let errorMsg = "⚠️ Connection error. Please check your network or try again later.";
      if (err.message.includes("Failed to fetch")) {
        errorMsg = "⚠️ Cannot connect to the server. Please check if the API is available.";
      } else if (err.message) {
        errorMsg = `⚠️ Error: ${err.message}`;
      }
      
      appendMessage(errorMsg, "bot");
    } finally {
      // Re-enable UI
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
      autoResize();
    }
  }
  
  // Welcome message on load
  if (chatBox && chatBox.children.length === 0) {
    const welcomeMsg = "👋 Hello! I'm Lexi, your AI legal assistant for Uganda. Ask me anything about Ugandan law, rights, or legal procedures. How can I assist you today?";
    appendMessage(welcomeMsg, "bot");
  }
  
  if (input) {
    input.focus();
  }
});
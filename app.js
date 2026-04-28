// Wait for DOM to fully load before running
document.addEventListener('DOMContentLoaded', function() {
  // API Configuration - Try multiple endpoints
  const API_ENDPOINTS = [
    "https://juris-ai.fastapicloud.dev/ask",
  ];
  
  let currentApiUrl = API_ENDPOINTS[0];
  let retryCount = 0;
  const MAX_RETRIES = 3;
  
  // DOM Elements
  const chatBox = document.getElementById("chat-box");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");
  const statusBadge = document.getElementById("statusBadge");
  
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
  
  // Update connection status
  function updateStatus(status, isOnline) {
    if (statusBadge) {
      statusBadge.className = `status-badge ${isOnline ? 'online' : 'offline'}`;
      const icon = statusBadge.querySelector('i');
      const textSpan = statusBadge.querySelector('span');
      if (icon) {
        icon.className = isOnline ? 'fas fa-circle' : 'fas fa-exclamation-triangle';
      }
      if (textSpan) textSpan.textContent = status;
    }
  }
  
  // Test API connection
  async function testConnection() {
    for (const url of API_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // Try health endpoint first
        const healthUrl = url.replace('/ask', '/health');
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          currentApiUrl = url;
          updateStatus('Connected', true);
          console.log(`✅ Connected to: ${currentApiUrl}`);
          return true;
        }
      } catch (err) {
        console.log(`Failed to connect to ${url}:`, err.message);
      }
    }
    
    updateStatus('Offline', false);
    return false;
  }
  
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
  
  function formatSources(sources) {
    if (!sources || !Array.isArray(sources) || sources.length === 0) return "";
    
    let html = `<div class="sources-container" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
      <i class="fas fa-database"></i> <strong>Legal References:</strong>`;
    
    sources.forEach(src => {
      const actName = src.act_name || src.source || src.title || "Legal reference";
      const section = src.section ? ` (${src.section})` : '';
      let contentSnippet = src.content_preview || src.content || src.text || "";
      if (contentSnippet.length > 150) contentSnippet = contentSnippet.substring(0, 150) + "…";
      const relevance = src.relevance_score ? ` · ${Math.round(src.relevance_score * 100)}% relevant` : '';
      
      html += `
        <div style="background: #f9fafb; padding: 8px 10px; border-radius: 10px; margin-top: 8px; border-left: 3px solid #10b981;">
          <b style="color: #0f766e; font-size: 0.7rem; display: block; margin-bottom: 4px;">📚 ${escapeHtml(actName)}${escapeHtml(section)}${relevance}</b>
          <small style="color: #6b7280; font-size: 0.65rem; line-height: 1.4; display: block;">${escapeHtml(contentSnippet)}</small>
        </div>
      `;
    });
    
    html += `</div>`;
    return html;
  }
  
  // Send message with retry logic
  async function sendMessageWithRetry(question, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(currentApiUrl, {
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
        
        // Handle bad gateway - try next endpoint
        if (response.status === 502 || response.status === 504) {
          console.log(`Got ${response.status}, trying next endpoint...`);
          const currentIndex = API_ENDPOINTS.indexOf(currentApiUrl);
          if (currentIndex < API_ENDPOINTS.length - 1 && currentIndex !== -1) {
            currentApiUrl = API_ENDPOINTS[currentIndex + 1];
            continue;
          }
          throw new Error(`Server temporarily unavailable (${response.status})`);
        }
        
        // Handle rate limiting
        if (response.status === 429) {
          const waitTime = parseInt(response.headers.get('Retry-After') || '60');
          appendMessage(`⚠️ Rate limit reached. Please wait ${waitTime} seconds before asking another question.`, "bot");
          throw new Error(`Rate limited. Wait ${waitTime}s`);
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
        
      } catch (err) {
        if (i === retries - 1) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
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
      // Ensure we have a connection
      const isConnected = await testConnection();
      if (!isConnected) {
        throw new Error("No API connection available. Please check your internet connection.");
      }
      
      console.log("Making API request to:", currentApiUrl);
      
      const data = await sendMessageWithRetry(question);
      
      console.log("API Response:", data);
      
      removeTyping();
      
      // Bot main answer
      let botReply = data.response || "I'm sorry, I couldn't process that request.";
      appendMessage(botReply, "bot");
      
      // Show confidence score if available
      if (data.confidence_score) {
        const confidenceHtml = `<div style="font-size: 0.65rem; color: #6b7280; margin-top: 4px;">
          <i class="fas fa-chart-line"></i> Confidence: ${Math.round(data.confidence_score * 100)}%
        </div>`;
        const lastMsg = chatBox.lastElementChild;
        if (lastMsg && lastMsg.classList.contains('message', 'bot')) {
          lastMsg.innerHTML += confidenceHtml;
        }
      }
      
      // Show which acts were consulted
      if (data.acts_consulted && Array.isArray(data.acts_consulted) && data.acts_consulted.length > 0) {
        const actsHtml = `<div style="margin-top: 8px; font-size: 0.7rem; color: #6b7280;">
          <i class="fas fa-book"></i> <strong>Acts consulted:</strong> ${data.acts_consulted.join(', ')}
        </div>`;
        const lastMsg = chatBox.lastElementChild;
        if (lastMsg && lastMsg.classList.contains('message', 'bot')) {
          lastMsg.innerHTML += actsHtml;
        }
      }
      
      // Append sources if present
      if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
        const sourcesHtml = formatSources(data.sources);
        appendMessage(sourcesHtml, "bot", true);
      }
      
      // Show processing time (optional - for debugging)
      if (data.processing_time && console.debug) {
        console.debug(`Response time: ${data.processing_time}s`);
      }
      
      retryCount = 0; // Reset retry count on success
      
    } catch (err) {
      console.error("Error details:", err);
      removeTyping();
      
      let errorMsg = "";
      
      if (err.message.includes("502") || err.message.includes("504")) {
        errorMsg = "⚠️ The legal AI server is temporarily unavailable. This usually resolves in a minute. Please try again.";
      } else if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        errorMsg = "⚠️ Cannot connect to the legal AI service. Please check your internet connection and try again.";
      } else if (err.message.includes("429")) {
        errorMsg = "⚠️ Too many requests. Please wait a moment before asking another question.";
      } else if (err.message.includes("No API connection")) {
        errorMsg = "⚠️ " + err.message;
      } else {
        errorMsg = `⚠️ Error: ${err.message}`;
      }
      
      appendMessage(errorMsg, "bot");
      
      // Add retry button for failed messages
      const retryHtml = `<button class="retry-btn" style="background: none; border: none; color: #10b981; font-size: 0.7rem; cursor: pointer; margin-top: 8px; text-decoration: underline;">
        <i class="fas fa-redo"></i> Retry this question
      </button>`;
      const lastMsg = chatBox.lastElementChild;
      if (lastMsg && lastMsg.classList.contains('message', 'bot')) {
        lastMsg.innerHTML += retryHtml;
        const retryBtn = lastMsg.querySelector('.retry-btn');
        if (retryBtn) {
          retryBtn.onclick = () => {
            // Remove the error message and retry
            lastMsg.remove();
            sendBtn.disabled = false;
            input.disabled = false;
            sendMessage();
          };
        }
      }
      
    } finally {
      // Re-enable UI
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
      autoResize();
    }
  }
  
  // Test connection on load
  testConnection().then(connected => {
    if (!connected) {
      appendMessage("⚠️ **Connection Notice:** I'm having trouble reaching the legal database. Your questions will be sent once connection is restored.", "bot");
    }
  });
  
  // Welcome message on load
  if (chatBox && chatBox.children.length === 0) {
    const welcomeMsg = `👋 **Hello! I'm Juris**, your AI legal assistant for Uganda.

I can help you with questions about:
• The Constitution of Uganda
• Penal Code and Criminal Law
• Land Act and Property Rights
• Employment Law
• Marriage, Divorce, and Family Law
• And 16+ other Ugandan legal acts

**How can I assist you today?**`;
    appendMessage(welcomeMsg, "bot");
  }
  
  if (input) {
    input.focus();
  }
  
  // Handle online/offline events
  window.addEventListener('online', () => {
    testConnection();
    appendMessage("✅ Internet connection restored! You can continue asking questions.", "bot");
  });
  
  window.addEventListener('offline', () => {
    updateStatus('Offline', false);
    appendMessage("⚠️ You appear to be offline. Please check your internet connection.", "bot");
  });
  
  // Periodic connection check (every 30 seconds)
  setInterval(() => {
    if (navigator.onLine) {
      testConnection();
    }
  }, 30000);
});

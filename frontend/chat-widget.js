
(function() {
  var chatWidget = {
    isOpen: false,
    messages: [],
    vendeurData: null,

    init: function() {
      this.createWidget();
      this.loadMessages();
      this.attachEvents();
    },

    createWidget: function() {
      var html = '<div id="chatWidget" class="chat-widget"><div class="chat-button" id="chatButton"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 11.5C21 16.75 16.75 21 11.5 21C6.25 21 2 16.75 2 11.5C2 6.25 6.25 2 11.5 2C16.75 2 21 6.25 21 11.5Z" stroke="white" stroke-width="2"/><path d="M7 11h9M11 7v8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg><span class="chat-badge" id="chatBadge">1</span></div><div class="chat-window" id="chatWindow"><div class="chat-header"><div class="chat-header-info"><div class="chat-avatar">💬</div><div><div class="chat-vendor-name" id="chatVendorName">Support</div><div class="chat-status">En ligne</div></div></div><button class="chat-close" id="chatClose">×</button></div><div class="chat-messages" id="chatMessages"></div><div class="chat-input-container"><input type="text" class="chat-input" id="chatInput" placeholder="Écrivez votre message..."><button class="chat-send" id="chatSend">➤</button></div></div></div>';

      var container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container.firstChild);

      this.injectStyles();
    },

    injectStyles: function() {
      var style = document.createElement('style');
      style.textContent = '.chat-widget{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:"DM Sans",sans-serif}.chat-button{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#0F9D58 0%,#D4AF37 100%);box-shadow:0 4px 20px rgba(15,157,88,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s;position:relative}.chat-button:hover{transform:scale(1.1);box-shadow:0 6px 30px rgba(15,157,88,.6)}.chat-badge{position:absolute;top:-4px;right:-4px;background:#EF4444;color:#fff;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center}.chat-badge.show{display:flex}.chat-window{position:absolute;bottom:80px;right:0;width:360px;height:500px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden}.chat-window.open{display:flex}.chat-header{background:linear-gradient(135deg,#0F9D58 0%,#0B7A43 100%);color:#fff;padding:16px;display:flex;justify-content:space-between;align-items:center}.chat-header-info{display:flex;align-items:center;gap:12px}.chat-avatar{width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px}.chat-vendor-name{font-weight:700;font-size:15px}.chat-status{font-size:12px;opacity:.9}.chat-close{background:none;border:none;color:#fff;font-size:28px;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .2s}.chat-close:hover{background:rgba(255,255,255,.1)}.chat-messages{flex:1;overflow-y:auto;padding:16px;background:#f5f5f5}.chat-message{margin-bottom:12px;display:flex;flex-direction:column}.chat-message.client{align-items:flex-end}.chat-message.vendor{align-items:flex-start}.chat-message-bubble{max-width:70%;padding:10px 14px;border-radius:16px;word-wrap:break-word;font-size:14px;line-height:1.4}.chat-message.client .chat-message-bubble{background:#0F9D58;color:#fff;border-bottom-right-radius:4px}.chat-message.vendor .chat-message-bubble{background:#fff;color:#1f2937;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.1)}.chat-message-time{font-size:11px;color:#9ca3af;margin-top:4px}.chat-input-container{padding:12px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:8px}.chat-input{flex:1;padding:10px 14px;border:1px solid #e5e7eb;border-radius:20px;font-family:inherit;font-size:14px;outline:none}.chat-input:focus{border-color:#0F9D58}.chat-send{width:40px;height:40px;background:#0F9D58;color:#fff;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:all .2s}.chat-send:hover{background:#0B7A43;transform:scale(1.05)}@media (max-width:480px){.chat-window{width:calc(100vw - 48px);height:calc(100vh - 120px)}}';
      document.head.appendChild(style);
    },

    attachEvents: function() {
      var self = this;
      
      document.getElementById('chatButton').onclick = function() {
        self.toggleChat();
      };
      
      document.getElementById('chatClose').onclick = function() {
        self.toggleChat();
      };
      
      document.getElementById('chatSend').onclick = function() {
        self.sendMessage();
      };
      
      document.getElementById('chatInput').onkeypress = function(e) {
        if (e.key === 'Enter') {
          self.sendMessage();
        }
      };
    },

    toggleChat: function() {
      var window = document.getElementById('chatWindow');
      var badge = document.getElementById('chatBadge');
      
      this.isOpen = !this.isOpen;
      
      if (this.isOpen) {
        window.classList.add('open');
        badge.classList.remove('show');
        this.displayMessages();
        document.getElementById('chatInput').focus();
      } else {
        window.classList.remove('open');
      }
    },

    sendMessage: function() {
      var input = document.getElementById('chatInput');
      var text = input.value.trim();
      
      if (!text) return;
      
      var message = {
        id: Date.now(),
        text: text,
        sender: 'client',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };
      
      this.messages.push(message);
      this.saveMessages();
      this.displayMessages();
      
      input.value = '';
      
      
      setTimeout(function() {
        chatWidget.sendVendorMessage();
      }, 1000);
    },

    sendVendorMessage: function() {
      var responses = [
        "Merci pour votre message ! Je vais vous répondre dans quelques instants.",
        "Bonjour ! Comment puis-je vous aider ?",
        "Je suis là pour vous aider. Quelle est votre question ?",
        "Merci de votre intérêt ! Je reviens vers vous très vite.",
        "N'hésitez pas à me contacter sur WhatsApp pour une réponse plus rapide : " + (this.vendeurData ? this.vendeurData.tel : "")
      ];
      
      var response = responses[Math.floor(Math.random() * responses.length)];
      
      var message = {
        id: Date.now(),
        text: response,
        sender: 'vendor',
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };
      
      this.messages.push(message);
      this.saveMessages();
      this.displayMessages();
      
      if (!this.isOpen) {
        document.getElementById('chatBadge').classList.add('show');
      }
    },

    displayMessages: function() {
      var container = document.getElementById('chatMessages');
      container.innerHTML = '';
      
      if (this.messages.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px 20px;font-size:14px;">👋 Bonjour ! Envoyez un message pour démarrer la conversation.</div>';
        return;
      }
      
      this.messages.forEach(function(msg) {
        var div = document.createElement('div');
        div.className = 'chat-message ' + msg.sender;
        div.innerHTML = '<div class="chat-message-bubble">' + msg.text + '</div><div class="chat-message-time">' + msg.time + '</div>';
        container.appendChild(div);
      });
      
      container.scrollTop = container.scrollHeight;
    },

    loadMessages: function() {
      var stored = localStorage.getItem('chatMessages_' + window.location.pathname);
      if (stored) {
        try {
          this.messages = JSON.parse(stored);
        } catch (e) {
          this.messages = [];
        }
      }
    },

    saveMessages: function() {
      localStorage.setItem('chatMessages_' + window.location.pathname, JSON.stringify(this.messages));
    },

    setVendeurData: function(data) {
      this.vendeurData = data;
      document.getElementById('chatVendorName').textContent = data.boutique;
    }
  };

  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      chatWidget.init();
    });
  } else {
    chatWidget.init();
  }

  
  window.chatWidget = chatWidget;
})();
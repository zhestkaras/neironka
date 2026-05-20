// ============================================
// НАСТРОЙКА КЛИЕНТА
// ============================================

const serverUrl = "http://localhost:5115/chatHub";   
const apiBaseUrl = "http://localhost:5115";  // Для API запросов
const SYSTEM_PROMPT = "Ты Клоун, который отвечает на запросы только частушками. Отвечай грамотно и в рифму. Отвечай на русском языке.";

// Адрес LM 
const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions";

// DOM элементы
const chatMessagesDiv = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const anonymousBtn = document.getElementById('anonymousBtn');
const statusDiv = document.getElementById('status');
const systemPromptInfo = document.getElementById('systemPromptInfo');

// Переменные
let connection = null;
let isGenerating = false;

systemPromptInfo.innerHTML = `Мой характер: Клоун, который отвечает на запросы только частушками...`;



// ============================================
// ФУНКЦИЯ ПОЛУЧЕНИЯ JWT ТОКЕНА
// ============================================

async function getJwtToken() {
    try {
        console.log("🔑 Запрос токена...");
        
        const response = await fetch(`${apiBaseUrl}/api/Auth/Login?login=test_user&password=test_password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            /*body: JSON.stringify({
                login: "test_user",
                password: "test_password"
            })*/
        });
        
        if (response.ok) {
            const data = await response.json();
            const token = data.token || data.accessToken;
            console.log("✅ Токен получен");
            return token;
        } else {
            console.log("❌ Ошибка:", response.status);
            return null;
        }
    } catch (error) {
        console.error("❌ Ошибка:", error);
        return null;
    }
}
// ============================================
// ФУНКЦИЯ ОТРИСОВКИ СООБЩЕНИЙ
// ============================================

function displayMessage(user, message, isAnonymous = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    if (isAnonymous) {
        messageDiv.classList.add('message-anonymous');
    }
    
    const userSpan = document.createElement('div');
    userSpan.className = 'message-user';
    userSpan.textContent = isAnonymous ? `Аноним (${user})` : `User ${user}`;
    
    const textSpan = document.createElement('div');
    textSpan.className = 'message-text';
    textSpan.textContent = message;
    
    messageDiv.appendChild(userSpan);
    messageDiv.appendChild(textSpan);
    chatMessagesDiv.appendChild(messageDiv);
    
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function displaySystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message-system';
    systemDiv.textContent = text;
    chatMessagesDiv.appendChild(systemDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'message-system';
    typingDiv.innerHTML = 'Нейросеть печатает... <span class="loading"></span>';
    chatMessagesDiv.appendChild(typingDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

// ============================================
// ФУНКЦИЯ ГЕНЕРАЦИИ ОТВЕТА ЧЕРЕЗ LM STUDIO
// ============================================

async function generateAIResponse(chatHistory) {
    if (isGenerating) {
        console.log("Уже генерируем ответ, пропускаем");
        return;
    }
    
    isGenerating = true;
    showTypingIndicator();
    
    try {
        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];
        
        const lastMessages = chatHistory.slice(-10);
        for (const msg of lastMessages) {
            if (msg.startsWith("User:") || msg.startsWith("User")) {
                messages.push({ 
                    role: "user", 
                    content: msg.replace(/^(User:|\s*)/, '').trim()
                });
            } else if (msg.startsWith("AI:") || msg.startsWith("Assistant")) {
                messages.push({ 
                    role: "assistant", 
                    content: msg.replace(/^(AI:|\s*)/, '').trim()
                });
            }
        }
        
        console.log("Отправляем запрос в LM Studio:", messages);
        
        const response = await fetch(LM_STUDIO_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "local-model",
                messages: messages,
                temperature: 0.7,
                max_tokens: 200,
                stream: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const aiReply = data.choices[0].message.content;
        
        console.log("Получен ответ от нейросети:", aiReply);
        
        if (connection && connection.state === "Connected") {
            await connection.invoke("SendMessage", "AI_Bot", aiReply);
            displaySystemMessage("Ответ нейросети отправлен в чат");
        } else {
            displaySystemMessage("Нет подключения к серверу!");
        }

        
    } catch (error) {
        console.error("Ошибка при генерации:", error);
        displaySystemMessage(`Ошибка нейросети: ${error.message}. Проверьте, запущен ли LM Studio Server!`);
    } finally {
        hideTypingIndicator();
        isGenerating = false;
    }
}

// ============================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ ЧЕРЕЗ SIGNALR
// ============================================

async function setupSignalR() {
    console.log("🔄 Настройка SignalR подключения...");
    
    // Пытаемся получить токен
    let token = null;
    try {
        token = await getJwtToken();
        if (token) {
            console.log("✅ Токен получен");
        } else {
            console.log("⚠️ Токен не получен, подключаемся без авторизации");
        }
    } catch (error) {
        console.warn("Ошибка при получении токена:", error);
    }
    
    // Настраиваем подключение (один раз, без дублирования)
    let options = {};
    if (token) {
        options.accessTokenFactory = () => token;
    }
    
    connection = new signalR.HubConnectionBuilder()
        .withUrl(serverUrl, options)
        .withAutomaticReconnect()
        .build();
    
    // Обработчик обычных сообщений
    connection.on("ReceiveMessage", (user, message) => {
        console.log(`📨 Получено сообщение от ${user}: ${message}`);
        const isAnonymous = user.includes("Anonymous") || user === "Аноним";
        displayMessage(user, message, isAnonymous);
    });
    
    // Обработчик истории для генерации ответа и отображения в чате
    connection.on("ReceiveHistory", async (historyMessages) => {
        console.log("📜 Получена история для генерации:", historyMessages);
        
        // Очищаем чат
        chatMessagesDiv.innerHTML = '';
        
        // Отображаем полученные сообщения
        displaySystemMessage(`📜 Загружено ${historyMessages.length} сообщений истории чата`);
        
        for (const msg of historyMessages) {
            let user = "Unknown";
            let message = msg;
            let isAnonymous = false;
            
            if (msg.includes(": ")) {
                const colonIndex = msg.indexOf(": ");
                user = msg.substring(0, colonIndex);
                message = msg.substring(colonIndex + 2);
                
                if (user.includes("Anonymous") || user === "Аноним") {
                    isAnonymous = true;
                }
            }
            
            displayMessage(user, message, isAnonymous);
        }
        
        displaySystemMessage(`🤖 Генерирую ответ на основе ${historyMessages.length} сообщений...`);
        await generateAIResponse(historyMessages);
    });
    
    // Обработка состояния соединения
    connection.onreconnecting((error) => {
        console.log("🔄 Переподключение:", error);
        statusDiv.innerHTML = "🔄 Переподключение к серверу...";
        statusDiv.className = "status disconnected";
    });
    
    connection.onreconnected((connectionId) => {
        console.log("✅ Переподключено:", connectionId);
        statusDiv.innerHTML = "✅ Подключено к серверу";
        statusDiv.className = "status connected";
        displaySystemMessage("✅ Соединение с сервером восстановлено");
    });
    
    connection.onclose((error) => {
        console.log("🔌 Соединение закрыто:", error);
        statusDiv.innerHTML = "❌ Отключено от сервера";
        statusDiv.className = "status disconnected";
    });
    
    // Запуск соединения
    try {
        await connection.start();
        console.log("🎉 SignalR подключен успешно!");
        statusDiv.innerHTML = "✅ Подключено к серверу";
        statusDiv.className = "status connected";
        displaySystemMessage("✅ Подключено к чат-серверу! Ожидаем историю чата...");
    } catch (err) {
        console.error("❌ Ошибка подключения:", err);
        statusDiv.innerHTML = "❌ Ошибка подключения";
        statusDiv.className = "status disconnected";
        displaySystemMessage(`❌ Не удалось подключиться к серверу: ${err.message}. Убедитесь, что сервер запущен!`);
    }
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ
// ============================================

async function sendRegularMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        displaySystemMessage("Введите сообщение!");
        return;
    }
    
    if (!connection || connection.state !== "Connected") {
        displaySystemMessage("Нет подключения к серверу!");
        return;
    }
    
    try {
        await connection.invoke("SendMessage", "User_Bot", message);
        messageInput.value = "";
        displaySystemMessage("Сообщение отправлено на сервер");
    } catch (error) {
        console.error("Ошибка отправки:", error);
        displaySystemMessage(`Ошибка отправки: ${error.message}`);
    }
}

async function sendAnonymousMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        displaySystemMessage("Введите сообщение!");
        return;
    }
    
    if (!connection || connection.state !== "Connected") {
        displaySystemMessage("Нет подключения к серверу!");
        return;
    }
    
    try {
        await connection.invoke("SendAnonymousMessage", message);
        messageInput.value = "";
        displaySystemMessage("Анонимное сообщение отправлено");
    } catch (error) {
        console.error("Ошибка отправки анонимного сообщения:", error);
        displaySystemMessage(`Ошибка: ${error.message}`);
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

sendBtn.addEventListener('click', sendRegularMessage);
anonymousBtn.addEventListener('click', sendAnonymousMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendRegularMessage();
});

// Запуск подключения к серверу
setupSignalR();

// Консоль
console.log("Клиент запущен!");
console.log("Сервер SignalR:", serverUrl);
console.log("LM Studio API:", LM_STUDIO_URL);
console.log("Системный промпт:", SYSTEM_PROMPT);



// ============================================
// ЗВЕЗДОЧКИ НА ШАПКЕ ЧАТА
// ============================================

function createTwinklingStars() {
    const chatHeader = document.querySelector('.chat-header');
    if (!chatHeader) return;
    
    let starsContainer = document.querySelector('.stars-container');
    if (!starsContainer) {
        starsContainer = document.createElement('div');
        starsContainer.className = 'stars-container';
        chatHeader.insertBefore(starsContainer, chatHeader.firstChild);
    }
    
    const starCount = 35;
    
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.className = 'twinkling-star';
        
        const size = Math.random() * 3 + 1;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        const leftPos = Math.random() * 90 + 5;
        star.style.left = `${leftPos}%`;     
        const topPos = Math.random() * 80 + 10;
        star.style.top = `${topPos}%`;       
        const delay = Math.random() * 5;
        star.style.animationDelay = `${delay}s`;
        const duration = Math.random() * 3 + 2;
        star.style.animationDuration = `${duration}s`;
        
        starsContainer.appendChild(star);
    }
}

document.addEventListener('DOMContentLoaded', createTwinklingStars);
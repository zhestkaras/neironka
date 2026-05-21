// ============================================
// НАСТРОЙКА КЛИЕНТА
// ============================================

const serverUrl = "http://localhost:5115/chatHub";
const apiBaseUrl = "http://localhost:5115";
const SYSTEM_PROMPT = "Ты Клоун, который отвечает на запросы только частушками. Отвечай грамотно и в рифму. Отвечай на русском языке.";
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
let currentChatId = 1;

systemPromptInfo.innerHTML = "Мой характер: Клоун, который отвечает на запросы только частушками...";

// ФУНКЦИЯ ПОЛУЧЕНИЯ JWT ТОКЕНА
async function getJwtToken() {
    try {
        console.log("Запрос токена...");
        
        // Отправляем параметры в строке запроса (как ожидает сервер)
        const url = `${apiBaseUrl}/api/Auth/Login?login=test_user&password=test_password`;
        console.log("URL запроса:", url);
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        
        console.log("Статус ответа:", response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log("Ответ сервера:", result);
            
            // Извлекаем токен из поля Data
            let token = null;
            if (result.data) {
                token = result.data;
            } else if (result.token) {
                token = result.token;
            }
            
            if (token) {
                console.log("Токен получен");
                return token.replaceAll("\"", "");
            } else {
                console.log("Токен не найден в ответе");
                return null;
            }
        } else {
            const errorResult = await response.json();
            console.log("Ошибка входа:", response.status, errorResult);
            
            // Если пользователь не найден, пробуем зарегистрироваться
            if (response.status === 401 || errorResult.statusCode === 401) {
                console.log("Пользователь не найден, пробуем зарегистрироваться...");
                
                const registerUrl = `${apiBaseUrl}/api/Auth/Register?login=test_user&password=test_password`;
                const registerResponse = await fetch(registerUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
                
                console.log("Статус регистрации:", registerResponse.status);
                
                if (registerResponse.ok) {
                    const registerResult = await registerResponse.json();
                    console.log("Регистрация успешна:", registerResult);
                    
                    // После успешной регистрации пробуем войти снова
                    const retryResponse = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        }
                    });
                    
                    if (retryResponse.ok) {
                        const retryResult = await retryResponse.json();
                        const token = retryResult.data;
                        console.log("Токен получен после регистрации");
                        return token;
                    }
                } else {
                    const registerError = await registerResponse.json();
                    console.log("Ошибка регистрации:", registerError);
                }
            }
            
            return null;
        }
    } catch (error) {
        console.error("Ошибка при получении токена:", error);
        return null;
    }
}

// ФУНКЦИЯ ОТРИСОВКИ СООБЩЕНИЙ
function displayMessage(user, message, isAnonymous = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    if (isAnonymous) {
        messageDiv.classList.add('message-anonymous');
    }
    
    const userSpan = document.createElement('div');
    userSpan.className = 'message-user';
    userSpan.textContent = isAnonymous ? "Аноним (" + user + ")" : "User " + user;
    
    const textSpan = document.createElement('div');
    textSpan.className = 'message-text';
    textSpan.textContent = message;
    
    messageDiv.appendChild(userSpan);
    messageDiv.appendChild(textSpan);
    chatMessagesDiv.appendChild(messageDiv);
    
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;

    saveMessageToHistory(user, message, isAnonymous);
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

// ФУНКЦИЯ ГЕНЕРАЦИИ ОТВЕТА ЧЕРЕЗ LM STUDIO
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
        
        console.log("Отправляем запрос в LM Studio");
        
        const response = await fetch(LM_STUDIO_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "local-model",
                messages: messages,
                temperature: 0.7,
                max_tokens: 200,
                stream: false
            })
        });
        
        if (!response.ok) {
            throw new Error("HTTP " + response.status + ": " + response.statusText);
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
        displaySystemMessage("Ошибка нейросети: " + error.message);
    } finally {
        hideTypingIndicator();
        isGenerating = false;
    }
}

// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ ЧЕРЕЗ SIGNALR
async function setupSignalR() {
    console.log("Настройка SignalR подключения...");
    
    let token = await getJwtToken();
    if (!token) {
        displaySystemMessage("Не удалось получить токен");
        return;
    }
    
    let options = {
        accessTokenFactory: () => token
    };
    
    connection = new signalR.HubConnectionBuilder()
        .withUrl(serverUrl, options)
        .withAutomaticReconnect()
        .build();

     
    connection.on("ReceiveMessage", (message) => {
        console.log("Получено сообщение:", message);
        const user = message.senderLogin || "User";
        const text = message.text || message;
        const isAnonymous = user.includes("Anonymous");
        displayMessage(user, text, isAnonymous);
    });
    
    connection.on("GenerateResponse", async (historyMessages) => {
    console.log("Получена история от сервера:", historyMessages.length);
    
    // Очищаем только если это первый запуск или явно нужно
    if (chatMessagesDiv.children.length === 0) {
        // Загружаем из localStorage вместо очистки
        loadHistoryFromStorage();
        
        // Добавляем новые сообщения от сервера, которых нет в localStorage
        const existingMessages = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        const existingTexts = new Set(existingMessages.map(m => m.message + m.timestamp));
        
        for (const msg of historyMessages) {
            const user = msg.senderLogin || "User";
            const text = msg.text || msg;
            const isAnonymous = user.includes("Anonymous");
            
            // Проверяем, есть ли уже такое сообщение
            const messageKey = text + new Date(msg.timestamp).getTime();
            if (!existingTexts.has(messageKey)) {
                displayMessage(user, text, isAnonymous);
            }
        }
    }
    
    await generateAIResponse(historyMessages);
});
    
    connection.onreconnecting(() => {
        statusDiv.innerHTML = "Переподключение...";
        statusDiv.className = "status disconnected";
        displaySystemMessage("Потеря связи, переподключение...");
    });
    
    connection.onreconnected(async (connectionId) => {
        console.log("Соединение восстановлено:", connectionId);
        statusDiv.innerHTML = "Подключено";
        statusDiv.className = "status connected";
        displaySystemMessage("Соединение восстановлено, загружаю историю...");
        
        // Запрашиваем историю после переподключения
        try {
            const messages = await connection.invoke("GetMessages", currentChatId);
            if (messages && messages.data) {
                const historyMessages = JSON.parse(messages.data);
                chatMessagesDiv.innerHTML = '';
                displaySystemMessage("Загружено " + historyMessages.length + " сообщений");
                
                for (const msg of historyMessages) {
                    const user = msg.senderLogin || "User";
                    const text = msg.text || msg;
                    const isAnonymous = user.includes("Anonymous");
                    displayMessage(user, text, isAnonymous);
                }
            }
        } catch (error) {
            console.error("Ошибка получения истории:", error);
        }
    });
    
    connection.onclose(() => {
        statusDiv.innerHTML = "Отключено";
        statusDiv.className = "status disconnected";
    });
    
    try {
        await connection.start();
        console.log("SignalR подключен!");
        statusDiv.innerHTML = "Подключено";
        statusDiv.className = "status connected";
        displaySystemMessage("Подключено к чат-серверу!");
        
        // Запрашиваем историю при первом подключении
        const messages = await connection.invoke("GetMessages", currentChatId);
        if (messages && messages.data) {
            const historyMessages = JSON.parse(messages.data);
            chatMessagesDiv.innerHTML = '';
            displaySystemMessage("Загружено " + historyMessages.length + " сообщений");
            
            for (const msg of historyMessages) {
                const user = msg.senderLogin || "User";
                const text = msg.text || msg;
                const isAnonymous = user.includes("Anonymous");
                displayMessage(user, text, isAnonymous);
            }
        }
        
    } catch (err) {
        console.error("Ошибка:", err);
        statusDiv.innerHTML = "Ошибка";
        statusDiv.className = "status disconnected";
        displaySystemMessage("Ошибка: " + err.message);
    }
}

// ОТПРАВКА СООБЩЕНИЙ
async function sendRegularMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        displaySystemMessage("Введите сообщение!");
        return;
    }
    
    if (!connection || connection.state !== "Connected") {
        displaySystemMessage("Нет подключения!");
        return;
    }
    
    try {
        // Сразу отображаем своё сообщение в чате
        displayMessage("Я", message, false);
        
        // Отправляем на сервер
        await connection.invoke("SendMessage", message, currentChatId);
        messageInput.value = "";
        
    } catch (error) {
        displaySystemMessage("Ошибка: " + error.message);
    }
}

async function sendAnonymousMessage() {
    const message = messageInput.value.trim();
    if (!message) {
        displaySystemMessage("Введите сообщение!");
        return;
    }
    
    if (!connection || connection.state !== "Connected") {
        displaySystemMessage("Нет подключения!");
        return;
    }
    
    try {
        // Сразу отображаем своё анонимное сообщение в чате
        displayMessage("Аноним", message, true);
        
        // Отправляем на сервер
        await connection.invoke("SendMessage", message, currentChatId);
        messageInput.value = "";
        
    } catch (error) {
        displaySystemMessage("Ошибка: " + error.message);
    }
}

// ИНИЦИАЛИЗАЦИЯ
sendBtn.addEventListener('click', sendRegularMessage);
anonymousBtn.addEventListener('click', sendAnonymousMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendRegularMessage();
});

// Запуск подключения к серверу
setupSignalR();

console.log("Клиент запущен!");
console.log("Сервер SignalR:", serverUrl);
console.log("LM Studio API:", LM_STUDIO_URL);
console.log("Системный промпт:", SYSTEM_PROMPT);

// СОХРАНЕНИЕ ИСТОРИИ В ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
function saveMessageToHistory(user, message, isAnonymous = false) {
    let history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    
    history.push({
        user: user,
        message: message,
        isAnonymous: isAnonymous,
        timestamp: Date.now()
    });
    
    // Оставляем последние 100 сообщений
    if (history.length > 100) {
        history = history.slice(-100);
    }
    
    localStorage.setItem('chatHistory', JSON.stringify(history));
}

function loadHistoryFromStorage() {
    const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    chatMessagesDiv.innerHTML = '';
    
    if (history.length === 0) {
        displaySystemMessage("История чата пуста");
    } else {
        displaySystemMessage("Загружено " + history.length + " сообщений из истории");
        
        for (const msg of history) {
            displayMessage(msg.user, msg.message, msg.isAnonymous);
        }
    }
}

function clearHistory() {
    localStorage.removeItem('chatHistory');
    chatMessagesDiv.innerHTML = '';
    displaySystemMessage("История чата очищена");
}

// ЗВЕЗДОЧКИ НА ШАПКЕ ЧАТА
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
        star.style.width = size + "px";
        star.style.height = size + "px";
        star.style.left = (Math.random() * 90 + 5) + "%";
        star.style.top = (Math.random() * 80 + 10) + "%";
        star.style.animationDelay = (Math.random() * 5) + "s";
        star.style.animationDuration = (Math.random() * 3 + 2) + "s";
        
        starsContainer.appendChild(star);
    }
}

document.addEventListener('DOMContentLoaded', createTwinklingStars);
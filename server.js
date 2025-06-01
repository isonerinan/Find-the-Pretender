const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.url === '/game.js') {
        fs.readFile(path.join(__dirname, 'game.js'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading game.js');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(data);
        });
    }
});

const wss = new WebSocket.Server({ server });

// Add connection limit
const MAX_CONNECTIONS = 20;
let connectionCount = 0;

// Add rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 100;

// Game state
let players = new Map(); // Map of WebSocket to player data
let numberPicker = null;
let administrator = null;
let currentQuestion = null;
let gamePhase = 'waiting'; // waiting, voting, gameOver
let votes = new Map(); // Map of player names to their votes
let gameStarted = false;
let hasSubmittedNumber = false;
let myVote = null;
let playerName = '';  // Bunu da atamamışsan at, çünkü voteButton'da kontrol var


// Sample questions with ranges
const questions = [
    {
        text: "How many years would you wait before proposing?",
        min: 1,
        max: 10
    },
    {
        text: "What's your ideal number of children?",
        min: 0,
        max: 6
    },
    {
        text: "How many countries would you like to visit in your lifetime?",
        min: 5,
        max: 50
    },
    {
        text: "What's your dream salary in thousands?",
        min: 50,
        max: 500
    },
    {
        text: "How many languages would you like to learn?",
        min: 1,
        max: 10
    },
    {
        text: "What's your ideal number of pets?",
        min: 0,
        max: 5
    },
    {
        text: "How many hours of sleep do you need?",
        min: 4,
        max: 12
    },
    {
        text: "What's your ideal number of close friends?",
        min: 1,
        max: 20
    }
];

function getRandomQuestion() {
    return questions[Math.floor(Math.random() * questions.length)];
}

function broadcastToAll(message) {
    console.log('Broadcasting message:', message);
    players.forEach((playerData, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

function updatePlayersList() {
    const playersData = {};
    players.forEach((playerData, ws) => {
        if (!playerData.name) {
            console.warn('Player without name detected:', playerData);
            return;
        }

        playersData[playerData.name] = {
            number: playerData.number,
            votes: playerData.votes || 0,
            isAdmin: ws === administrator
        };
    });
    
    broadcastToAll({
        type: 'players',
        players: playersData
    });
}


function assignNewAdministrator() {
    if (players.size > 0) {
        const playerArray = Array.from(players.keys());
        administrator = playerArray[Math.floor(Math.random() * playerArray.length)];
        const playerData = players.get(administrator);
        playerData.isAdmin = true;
        
        administrator.send(JSON.stringify({
            type: 'role',
            isAdmin: true
        }));
        
        updatePlayersList();
    }
}

function startVotingPhase() {
    gamePhase = 'voting';
    votes.clear();
    players.forEach((playerData) => {
        playerData.votes = 0;
    });
    
    broadcastToAll({
        type: 'gameState',
        phase: 'voting'
    });
    
    updatePlayersList();
}

function processVotes() {
    const voteCounts = new Map();
    votes.forEach((target) => {
        voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
    });
    
    let maxVotes = 0;
    let eliminatedPlayer = null;
    
    voteCounts.forEach((count, player) => {
        if (count > maxVotes) {
            maxVotes = count;
            eliminatedPlayer = player;
        }
    });
    
    if (eliminatedPlayer) {
        const wasKöstebek = players.get(numberPicker).name === eliminatedPlayer;
        
        broadcastToAll({
            type: 'elimination',
            player: eliminatedPlayer,
            wasKöstebek: wasKöstebek
        });
        
        if (wasKöstebek) {
            endGame(false);
        } else {
            // Remove eliminated player
            for (const [ws, playerData] of players.entries()) {
                if (playerData.name === eliminatedPlayer) {
                    players.delete(ws);
                    break;
                }
            }
            
            // Check if Köstebek has won
            if (players.size <= 2) {
                endGame(true);
            } else {
                startNewRound();
            }
        }
    }
}

function endGame(köstebekWon) {
    gamePhase = 'gameOver';
    gameStarted = false;
    broadcastToAll({
        type: 'gameOver',
        köstebekWon: köstebekWon
    });
}

function startNewRound() {
    console.log('Starting new round...');
    currentQuestion = getRandomQuestion();
    gamePhase = 'waiting';

    // 1️⃣ Oyları sıfırla (EN KRİTİK NOKTA)
    votes.clear();

    // Assign new Köstebek if needed
    if (!numberPicker || !players.has(numberPicker)) {
        const playerArray = Array.from(players.keys());
        numberPicker = playerArray[Math.floor(Math.random() * playerArray.length)];
        console.log('New Köstebek assigned:', players.get(numberPicker)?.name);
    }

    // Reset player numbers & votes
    players.forEach((playerData) => {
        playerData.number = null;
        playerData.votes = 0; // Bunu da ekle
    });

    // Send role info
    players.forEach((playerData, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            if (ws === numberPicker) {
                ws.send(JSON.stringify({
                    type: 'role',
                    isNumberPicker: true,
                    minNumber: currentQuestion.min,
                    maxNumber: currentQuestion.max
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'role',
                    isNumberPicker: false,
                    question: currentQuestion.text
                }));
            }
        }
    });

    updatePlayersList();
}

wss.on('connection', (ws, req) => {
    // Check connection limit
    if (connectionCount >= MAX_CONNECTIONS) {
        ws.close(1008, 'Server is full');
        return;
    }
    connectionCount++;

    // Get client IP
    const ip = req.socket.remoteAddress;
    
    // Initialize rate limiting for this IP
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, {
            count: 0,
            resetTime: Date.now() + RATE_LIMIT_WINDOW
        });
    }

    players.set(ws, {
        name: null,
        number: null,
        votes: 0,
        isAdmin: false
    });
    
    ws.on('message', (message) => {
        // Check rate limit
        const rateLimitData = rateLimit.get(ip);
        if (rateLimitData) {
            if (Date.now() > rateLimitData.resetTime) {
                rateLimitData.count = 0;
                rateLimitData.resetTime = Date.now() + RATE_LIMIT_WINDOW;
            }
            rateLimitData.count++;
            
            if (rateLimitData.count > MAX_MESSAGES_PER_WINDOW) {
                ws.close(1008, 'Rate limit exceeded');
                return;
            }
        }

        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'join':
                handleJoin(ws, data.name);
                break;
            case 'answer':
                handleAnswer(ws, data.number);
                break;
            case 'vote':
                handleVote(ws, data.target);
                break;
            case 'startGame':
                handleStartGame(ws);
                break;
            case 'submitNumber':
                const playerData = players.get(ws);
                if (!playerData || !gameStarted) return;

                playerData.number = data.number;
                console.log(`${playerData.name} submitted number: ${data.number}`);

                updatePlayersList();
                break;

        }
    });
    
    ws.on('close', () => {
        connectionCount--;
        const playerData = players.get(ws);
        if (playerData) {
            players.delete(ws);
            
            if (ws === administrator) {
                assignNewAdministrator();
            }
            
            if (players.size > 0) {
                if (ws === numberPicker) {
                    startNewRound();
                } else {
                    updatePlayersList();
                }
            } else {
                numberPicker = null;
                administrator = null;
                currentQuestion = null;
                gamePhase = 'waiting';
                gameStarted = false;
            }
        }
    });
});

function handleJoin(ws, name) {
    console.log('Player joining:', name);
    const playerData = players.get(ws);
    if (!playerData) {
        console.log('No player data found for connection');
        return;
    }
    
    playerData.name = name;
    
    if (players.size === 1) {
        administrator = ws;
        playerData.isAdmin = true;
        ws.send(JSON.stringify({
            type: 'role',
            isAdmin: true
        }));
    }
    
    // Broadcast updated player list to all clients
    const playersData = {};
    players.forEach((data, client) => {
        if (data.name) {  // Only include players who have submitted their names
            playersData[data.name] = {
                number: data.number,
                votes: data.votes || 0,
                isAdmin: client === administrator
            };
        }
    });
    
    console.log('Broadcasting player list:', playersData);
    broadcastToAll({
        type: 'players',
        players: playersData
    });
}

function handleStartGame(ws) {
    console.log('Start game request received from:', players.get(ws)?.name);

    const activePlayers = Array.from(players.values()).filter(p => !p.eliminated || p.eliminated === false);

    if (activePlayers.length < 3) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Oyunu başlatmak için en az 3 oyuncu gerekir.'
        }));
        console.log('Start game rejected: too few players.');
        return;
    }

    if (ws === administrator && !gameStarted) {
        console.log('Starting new game...');
        gameStarted = true;
        resetPlayersForNewGame();
        startNewRound();

        broadcastToAll({
            type: 'gameState',
            phase: 'waiting',
            message: 'Oyun başladı!'
        });
    } else {
        console.log('Start game request rejected:', {
            isAdmin: ws === administrator,
            gameStarted: gameStarted
        });
    }
}



function resetPlayersForNewGame() {
    for (const [ws, player] of players.entries()) {
        player.number = null;
        player.votes = 0;
        player.eliminated = false;
        // Adminlik durumu kalabilir, istersen resetleme
    }
    köstebek = null;
    votes.clear();
    updatePlayersList(); // Bu kritik
}


function handleAnswer(ws, number) {
    if (!gameStarted) return;
    
    const playerData = players.get(ws);
    playerData.number = number;
    
    updatePlayersList();
    
    // Check if all players have submitted their numbers
    let allSubmitted = true;
    players.forEach((playerData) => {
        if (playerData.number === null) {
            allSubmitted = false;
        }
    });
    
    if (allSubmitted) {
        // Reveal the question and all numbers to everyone
        broadcastToAll({
            type: 'reveal',
            question: currentQuestion.text,
            numbers: Object.fromEntries(Array.from(players.entries()).map(([ws, data]) => [data.name, data.number]))
        });
        startVotingPhase();
    }
}

function handleVote(ws, target) {
    if (!gameStarted) return;

    const voterData = players.get(ws);
    if (!voterData) return; // Oy kullanan oyuncu kayıtlı değilse

    if (votes.has(voterData.name)) return; // Aynı oyuncu iki kez oy kullanamaz

    votes.set(voterData.name, target);
    console.log(`${voterData.name} voted for ${target}`);

    // Oy sayacı sıfırlanıyor
    players.forEach((playerData) => {
        playerData.votes = 0;
    });

    // Yeni oy dağılımı hesaplanıyor
    votes.forEach((targetName) => {
        const targetPlayer = [...players.values()].find(p => p.name === targetName);
        if (targetPlayer) {
            targetPlayer.votes++;
        }
    });

    updatePlayersList();

    // Tüm oyuncular oy kullandıysa sonuç işleniyor
    if (votes.size === players.size) {
        processVotes();
    }
}


const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
    console.log('To connect from other devices:');
    console.log('1. On the same network: use your local IP address');
    console.log('2. From the internet: use your public IP address');
    console.log('Note: Make sure port 8080 is forwarded in your router settings');
}); 
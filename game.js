// Sample questions for the game with their respective number ranges
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

let ws;
let isNumberPicker = false;
let isAdmin = false;
let minNumber = 1;
let maxNumber = 100;
let currentQuestion = null;
let playerName = '';
let hasSubmittedNumber = false;
let hasVoted = false;
let players = new Map(); // Map of player names to their data
let myVote = null;

// Connect to WebSocket server
function connect() {
    const serverUrl = window.location.origin.replace(/^http/, 'ws');
    ws = new WebSocket(`${serverUrl}`);
    
    ws.onopen = () => {
        console.log('Connected to server');
        document.getElementById('connectionStatus').textContent = 'Bağlandı';
        document.getElementById('connectionStatus').style.color = '#4CAF50';
        document.getElementById('nameInput').disabled = false;
        document.getElementById('submitName').disabled = false;
    };
    
    ws.onclose = (event) => {
        console.log('Disconnected from server:', event.code, event.reason);
        document.getElementById('connectionStatus').textContent = 'Bağlantı kesildi';
        document.getElementById('connectionStatus').style.color = '#f44336';
        document.getElementById('nameInput').disabled = true;
        document.getElementById('submitName').disabled = true;
        
        // Show error message based on close code
        let errorMessage = 'Sunucu bağlantısı kesildi. ';
        if (event.code === 1008) {
            errorMessage += event.reason || 'Sunucu dolu veya hız sınırı aşıldı.';
        } else {
            errorMessage += 'Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.';
        }
        alert(errorMessage);
        
        // Try to reconnect after 5 seconds
        setTimeout(connect, 5000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('connectionStatus').textContent = 'Bağlantı hatası';
        document.getElementById('connectionStatus').style.color = '#f44336';
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
}

function submitName() {
    const nameInput = document.getElementById('nameInput');
    const name = nameInput.value.trim();
    
    if (name) {
        playerName = name;
        document.getElementById('nameInputContainer').style.display = 'none';
        document.getElementById('role').style.display = 'inline-block';
        
        ws.send(JSON.stringify({
            type: 'join',
            name: name
        }));
    } else {
        alert('Lütfen isminizi girin');
    }
}

function startGame() {
    console.log('Starting game...'); // Add logging
    if (isAdmin) {
        ws.send(JSON.stringify({
            type: 'startGame'
        }));
    }
}

function handleMessage(data) {
    console.log('Received message:', data); // Add logging to debug

    switch (data.type) {
        case 'error':
            alert(data.message); // Sunucudan gelen hata mesajını kullanıcıya göster
            break;
        case 'role':
            hasSubmittedNumber = false;
            myVote = null;
            handleRoleAssignment(data);
            break;
        case 'players':
            console.log('Updating players list with:', data.players); // Add logging
            updatePlayersList(data.players);
            break;
        case 'gameState':
            handleGameState(data);
            break;
        case 'elimination':
            handleElimination(data);
            break;
        case 'gameOver':
            handleGameOver(data);
            break;
        case 'reveal':
            handleReveal(data);
            break;
    }
}


function handleRoleAssignment(data) {
    const roleElement = document.getElementById('role');
    if (data.eliminated) {
        roleElement.textContent = 'İzleyici (Atıldın)';
        roleElement.className = 'role atildi';
        roleElement.style.display = 'inline-block';
    
        // Sayı girme alanını ve prompt'u gizle
        document.getElementById('numberInput').style.display = 'none';
        document.getElementById('prompt').textContent = 'Bir sonraki turu bekliyorsun.';
        return;
    }    
    if (data.isAdmin !== undefined) {
        isAdmin = data.isAdmin;
        roleElement.textContent = isAdmin ? 'Yönetici' : 'Oyuncu';
        roleElement.className = `role ${isAdmin ? 'yönetici' : 'oyuncu'}`;
        roleElement.style.display = 'inline-block';

        if (isAdmin) {
            const existingButton = document.getElementById('startGameButton');
            if (existingButton) existingButton.remove();
            const startButton = document.createElement('button');
            startButton.id = 'startGameButton';
            startButton.textContent = 'Oyunu Başlat';
            startButton.onclick = startGame;
            document.getElementById('gameArea').insertBefore(
                startButton,
                document.getElementById('prompt')
            );
        } else {
            const existingButton = document.getElementById('startGameButton');
            if (existingButton) existingButton.remove();
        }
    } else if (data.isNumberPicker !== undefined) {
        isNumberPicker = data.isNumberPicker;
        roleElement.textContent = isNumberPicker ? 'Köstebek' : 'Avcı';
        roleElement.className = `role ${isNumberPicker ? 'köstebek' : 'avcı'}`;
        roleElement.style.display = 'inline-block';

        const prompt = document.getElementById('prompt');
        const numberInput = document.getElementById('numberInput');
        const numberField = document.getElementById('number');

        numberInput.style.display = 'block';

        if (isNumberPicker) {
            minNumber = data.minNumber;
            maxNumber = data.maxNumber;
            prompt.textContent = `${minNumber} ile ${maxNumber} arasında bir sayı seçiniz.`;
            numberField.min = minNumber;
            numberField.max = maxNumber;
        } else {
            // Avcı
            const questionText = typeof data.question === 'string' ? data.question : data.question?.text || '';
            prompt.textContent = questionText;
            numberField.min = 0;
            numberField.max = 9999;
        }
    }
}


function updatePlayersList(playersData) {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    
    // Convert playersData object to array of entries
    const playersArray = Object.entries(playersData);
    
    playersArray.forEach(([name, playerData]) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = name + (playerData.isAdmin ? ' (Yönetici)' : '') + (playerData.eliminated ? ' (Atıldı)' : '');

        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'player-number';
        numberSpan.textContent = playerData.number ? `Sayı: ${playerData.number}` : 'Bekleniyor...';
        
        const voteButton = document.createElement('button');
        voteButton.className = `vote-button ${myVote === name ? 'voted' : ''}`;
        voteButton.textContent = 'Oy Ver';
        voteButton.onclick = () => voteForPlayer(name);
        voteButton.disabled = !hasSubmittedNumber || name === playerName || playerData.eliminated;
        
        const voteCount = document.createElement('span');
        voteCount.className = 'vote-count';
        voteCount.textContent = `Oylar: ${playerData.votes || 0}`;
        
        playerDiv.appendChild(nameSpan);
        playerDiv.appendChild(numberSpan);
        playerDiv.appendChild(voteButton);
        playerDiv.appendChild(voteCount);
        
        playersList.appendChild(playerDiv);
    });
}

function handleGameState(data) {
    console.log('Game state update:', data); // Add logging
    
    if (data.phase === 'voting') {
        document.getElementById('waitingMessage').textContent = 'Oylama aşaması - Köstebek olduğunu düşündüğünüz kişiyi seçin!';
        hasSubmittedNumber = true;  // Oy verme aşamasında sayı gönderimi tamamdır zaten
    } else if (data.phase === 'waiting') {
        hasSubmittedNumber = false;  // Burada resetle yoksa butonlar hep disabled kalır
        
        if (data.question) {
            // Show the question and number input
            const prompt = document.getElementById('prompt');
            prompt.textContent = data.question.text;
            
            // Show number input and set its range
            const numberInput = document.getElementById('numberInput');
            numberInput.style.display = 'block';
            
            const numberField = document.getElementById('number');
            numberField.min = data.question.min;
            numberField.max = data.question.max;
            
            // Update status message
            document.getElementById('waitingMessage').textContent = 
                `Lütfen ${data.question.min} ile ${data.question.max} arasında bir sayı girin`;
        } else {
            document.getElementById('waitingMessage').textContent = 'Diğer oyuncular bekleniyor...';
        }
    }
}


function handleElimination(data) {
    const eliminatedPlayer = data.player;
    const wasKöstebek = data.wasKöstebek;
    
    const resultDiv = document.getElementById('gameResult');
    resultDiv.style.display = 'block';
    resultDiv.className = wasKöstebek ? 'winner' : 'loser';
    resultDiv.textContent = wasKöstebek ? 
        `Game Over! The Köstebek (${eliminatedPlayer}) was caught! Avcılar win!` :
        `Game Over! ${eliminatedPlayer} was eliminated but they were not the Köstebek!`;
}

function handleGameOver(data) {
    const resultDiv = document.getElementById('gameResult');
    resultDiv.style.display = 'block';

    if (data.winCondition === 1) {
        resultDiv.className = 'winner';
        resultDiv.textContent = 'Game Over! The Köstebek has won!';
    } else if (data.winCondition === 2) {
        resultDiv.className = 'winner';
        resultDiv.textContent = 'Game Over! The Avcılar have won!';
    } else {
        // Hala devam ediyorsa ya da hata varsa
        resultDiv.className = '';
        resultDiv.textContent = 'Game is still ongoing...';
    }
}


function handleReveal(data) {
    // Show the question to everyone
    const prompt = document.getElementById('prompt');
    prompt.textContent = data.question;
    // Show all submitted numbers
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    Object.entries(data.numbers).forEach(([name, number]) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = name;
        const numberSpan = document.createElement('span');
        numberSpan.className = 'player-number';
        numberSpan.textContent = `Sayı: ${number}`;
        playerDiv.appendChild(nameSpan);
        playerDiv.appendChild(numberSpan);
        playersList.appendChild(playerDiv);
    });
    // Hide vote buttons after reveal
    document.querySelectorAll('.vote-button').forEach(btn => {
        btn.disabled = true;
    });
}

function submitNumber() {
    const number = parseInt(document.getElementById('number').value, 10);
    if (!isNaN(number)) {
        ws.send(JSON.stringify({
            type: 'submitNumber',
            number: number
        }));
        hasSubmittedNumber = true;
        document.getElementById('waitingMessage').textContent = 'Sayı gönderildi, diğer oyuncular bekleniyor...';
    } else {
        alert('Lütfen geçerli bir sayı girin.');
    }
}

function voteForPlayer(name) {
    if (!hasVoted && hasSubmittedNumber && name !== playerName) {
        ws.send(JSON.stringify({
            type: 'vote',
            target: name
        }));
        hasVoted = true;
        myVote = name;
        updatePlayersList(Object.fromEntries(players)); // update UI to reflect vote
    }
}

// Kick off the WebSocket connection on page load
window.onload = () => {
    connect();
    document.getElementById('submitName').onclick = submitName;
    document.getElementById('submitNumber').onclick = submitNumber;
};
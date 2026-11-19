import * as THREE from 'three';


// СИСТЕМА ЗВУКОВ
let audioCtx;

function playHitSound() {
    // Инициализируем AudioContext только после первого клика/нажатия (требование браузеров)
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Если контекст на паузе (браузер уснул), будим его
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Настройка звука: тип волны (square звучит как в старых играх), частота (высота звука)
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime); // 400 Гц — стандартный звук Pong
    // Делаем звук затухающим (чтобы не был резким)
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); 

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1); // Звук длится 0.1 секунды
}

// 1. Сцена
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);

// 2. Камера (Ортографическая)
const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 14; // С запасом
const camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 1000
);
camera.position.z = 10;

// 3. Рендерер
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// Стены
const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x334455 });
const wallGeometry = new THREE.BoxGeometry(20, 0.5, 1);

const topWall = new THREE.Mesh(wallGeometry, wallMaterial);
topWall.position.set(0, 6, 0);
scene.add(topWall);

const bottomWall = new THREE.Mesh(wallGeometry, wallMaterial);
bottomWall.position.set(0, -6, 0);
scene.add(bottomWall);

// Ракетки
const paddleGeometry = new THREE.BoxGeometry(0.4, 2, 1);
const paddleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

// Игрок (слева)
const playerPaddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
playerPaddle.position.set(-9, 0, 0);
scene.add(playerPaddle);

// ИИ (справа)
const player2Paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
player2Paddle.position.set(9, 0, 0);
scene.add(player2Paddle);

// Мяч
const ballGeometry = new THREE.CircleGeometry(0.25, 32);
const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const ball = new THREE.Mesh(ballGeometry, ballMaterial);
ball.position.set(0, 0, 0);
scene.add(ball);

// Переменные состояния
let ballSpeedX = 0.08;
let ballSpeedY = 0.08;
let playerScore = 0;
let aiScore = 0;
let isGameRunning = false;
let isPaused = false;      // Стоит ли игра на паузе
let isWaitingForServe = true; // Ждем ли подачи (мяч стоит)
let timeElapsed = 0; // Время в секундах
let lastTime = performance.now();
const timerElement = document.getElementById('timer');

const scoreElement = document.getElementById('score');
const messageElement = document.getElementById('message');

let gameMode = 'pve'; // 'pve' или 'pvp'

// DOM элементы
const mainMenu = document.getElementById('main-menu');
const uiElement = document.getElementById('ui');
const btnPve = document.getElementById('btn-pve');
const btnPvp = document.getElementById('btn-pvp');

btnPve.addEventListener('click', () => startMatch('pve'));
btnPvp.addEventListener('click', () => startMatch('pvp'));

function startMatch(mode) {
    gameMode = mode;
    mainMenu.classList.add('hidden');
    uiElement.classList.remove('hidden');
    startGame();
}

// Управление игроком
const keys = { 
    p1_up: false, p1_down: false, 
    p2_up: false, p2_down: false 
};
document.addEventListener('keydown', (e) => {
    // Игрок 1 (WASD)
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.p1_up = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.p1_down = true;
    
    // Игрок 2 (Стрелки) — только в режиме PvP
    if (gameMode === 'pvp') {
        if (e.key === 'ArrowUp') keys.p2_up = true;
        if (e.key === 'ArrowDown') keys.p2_down = true;
    }

    if (e.key === 'Escape' && isGameRunning) {
        isPaused = !isPaused;
        messageElement.textContent = isPaused ? "ПАУЗА (Esc чтобы продолжить)" : "";
    }

    if (e.key === ' ') {
        if (!isGameRunning) {
            startGame();
        } else if (isWaitingForServe && !isPaused) {
            isWaitingForServe = false;
            messageElement.textContent = "";
        }
    }
});
document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.p1_up = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.p1_down = false;
    if (e.key === 'ArrowUp') keys.p2_up = false;
    if (e.key === 'ArrowDown') keys.p2_down = false;
});
function startGame() {
    isGameRunning = true;
    isPaused = false;
    isWaitingForServe = true; // Ждем пробела для подачи
    playerScore = 0;
    aiScore = 0;
    updateScore();
    resetBall();
    messageElement.textContent = "Нажми Пробел для подачи";
}

function resetBall() {
    ball.position.set(0, 0, 0);
    // Случайный начальный угол
    ballSpeedX = (Math.random() > 0.5 ? 1 : -1) * 0.08;
    ballSpeedY = (Math.random() - 0.5) * 0.08;
    isWaitingForServe = true; 
}

function checkWinCondition() {
    if (playerScore >= 5 || aiScore >= 5) {
        isGameRunning = false;
        if (playerScore >= 5) {
            messageElement.textContent = "Победа! Нажми Пробел для рестарта";
        } else {
            const winner = gameMode === 'pve' ? "ИИ" : "Игрок 2";
            messageElement.textContent = `Победа: ${winner}! Нажми Пробел для рестарта`;
        }
        // Сбрасываем счет для следующей игры
        playerScore = 0;
        aiScore = 0;
        timeElapsed = 0; 
        timerElement.textContent = "00:00";
        updateScore();
    }
}

// Игровой цикл
function animate() {
    requestAnimationFrame(animate);

      const now = performance.now();
    const deltaTime = (now - lastTime) / 1000; // Миллисекунды в секунды
    lastTime = now;

    if (isGameRunning && !isPaused) {
        // Логика таймера (идет, только если мяч движется)
        if (!isWaitingForServe) {
            timeElapsed += deltaTime; 
            
            const minutes = Math.floor(timeElapsed / 60).toString().padStart(2, '0');
            const seconds = Math.floor(timeElapsed % 60).toString().padStart(2, '0');
            timerElement.textContent = `${minutes}:${seconds}`;
        }
        // Игрок 1
    if (keys.p1_up && playerPaddle.position.y < 4.7) playerPaddle.position.y += 0.09;
    if (keys.p1_down && playerPaddle.position.y > -4.7) playerPaddle.position.y -= 0.09;

    // Игрок 2 / ИИ
    if (gameMode === 'pve') {
        const aiTargetY = ball.position.y;
        const aiSpeed = 0.08;
        if (player2Paddle.position.y < aiTargetY - 0.1) player2Paddle.position.y += aiSpeed;
        if (player2Paddle.position.y > aiTargetY + 0.1) player2Paddle.position.y -= aiSpeed;
        player2Paddle.position.y = Math.max(-4.7, Math.min(4.7, player2Paddle.position.y));
        } 
    else {
        if (keys.p2_up && player2Paddle.position.y < 4.7) player2Paddle.position.y += 0.09;
        if (keys.p2_down && player2Paddle.position.y > -4.7) player2Paddle.position.y -= 0.09;
    }

        // 3. Движение мяча
        if (!isWaitingForServe) {
            ball.position.x += ballSpeedX;
            ball.position.y += ballSpeedY;

        // 4. Отскок от верхней/нижней стены 
        if (ball.position.y > 5.5 || ball.position.y < -5.5) {
            ballSpeedY *= -1;
            playHitSound();
        }
        

        // 5. Отскок от ракеток
        // Игрок
        if (ball.position.x < -8.6 && ball.position.x > -9.4 && 
            ball.position.y < playerPaddle.position.y + 1 && 
            ball.position.y > playerPaddle.position.y - 1) {
            ballSpeedX *= -1.05; // Ускорение по диздоку (3-5%)
            // Добавляем зависимость угла от точки попадания
            ballSpeedY += (ball.position.y - playerPaddle.position.y) * 0.05;
            playHitSound();
        }
        // ИИ
        if (ball.position.x > 8.6 && ball.position.x < 9.4 && 
            ball.position.y < player2Paddle.position.y + 1 && 
            ball.position.y > player2Paddle.position.y - 1) {
            ballSpeedX *= -1.05;
            ballSpeedY += (ball.position.y - player2Paddle.position.y) * 0.05;
            playHitSound();
        }

        // 6. Голы (выход за пределы)
        if (ball.position.x > 10) {
            playerScore++;
            updateScore();
            resetBall();
            messageElement.textContent = "Гол! Нажми Пробел для подачи";
            checkWinCondition();
        } else if (ball.position.x < -10) {
            aiScore++;
            updateScore();
            resetBall();
            messageElement.textContent = "Нажми Пробел для подачи";
            checkWinCondition();
        }
    }

    renderer.render(scene, camera);
      }
}

function updateScore() {
    scoreElement.textContent = `${playerScore} : ${aiScore}`;
}


animate();
resetBall();
mainMenu.classList.remove('hidden');
renderer.render(scene, camera);
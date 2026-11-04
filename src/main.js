import * as THREE from 'three';

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
const aiPaddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
aiPaddle.position.set(9, 0, 0);
scene.add(aiPaddle);

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

// Управление игроком
const keys = { w: false, s: false };
document.addEventListener('keydown', (e) => {
    // Управление
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.w = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.s = true;
    
    // Пауза (Esc)
    if (e.key === 'Escape' && isGameRunning) {
        isPaused = !isPaused;
        messageElement.textContent = isPaused ? "ПАУЗА (Esc чтобы продолжить)" : "";
    }

    // Пробел (Начало игры или подача после гола)
    if (e.key === ' ') {
        if (!isGameRunning) {
            startGame();
            isWaitingForServe = false; 
            messageElement.textContent = "";
        } else if (isWaitingForServe && !isPaused) {
            isWaitingForServe = false; // Подача после гола
            messageElement.textContent = "";
        }
    }

});
document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.w = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.s = false;
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
            messageElement.textContent = "Поражение! Нажми Пробел для рестарта";
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
        if (keys.w && playerPaddle.position.y < 4.7) playerPaddle.position.y += 0.09;
        if (keys.s && playerPaddle.position.y > -4.7) playerPaddle.position.y -= 0.09;      

        // 2. Движение ИИ (следует за мячом с задержкой)
        const aiTargetY = ball.position.y;
        const aiSpeed = 0.08; // Ограничение скорости ИИ
        if (aiPaddle.position.y < aiTargetY - 0.1) aiPaddle.position.y += aiSpeed;
        if (aiPaddle.position.y > aiTargetY + 0.1) aiPaddle.position.y -= aiSpeed;
        // Ограничение для ИИ
        aiPaddle.position.y = Math.max(-4.7, Math.min(4.7, aiPaddle.position.y));

        // 3. Движение мяча
        if (!isWaitingForServe) {
            ball.position.x += ballSpeedX;
            ball.position.y += ballSpeedY;

        // 4. Отскок от верхней/нижней стены 
        if (ball.position.y > 5.5 || ball.position.y < -5.5) {
            ballSpeedY *= -1;
        }

        // 5. Отскок от ракеток
        // Игрок
        if (ball.position.x < -8.6 && ball.position.x > -9.4 && 
            ball.position.y < playerPaddle.position.y + 1 && 
            ball.position.y > playerPaddle.position.y - 1) {
            ballSpeedX *= -1.05; // Ускорение по диздоку (3-5%)
            // Добавляем зависимость угла от точки попадания
            ballSpeedY += (ball.position.y - playerPaddle.position.y) * 0.05;
        }
        // ИИ
        if (ball.position.x > 8.6 && ball.position.x < 9.4 && 
            ball.position.y < aiPaddle.position.y + 1 && 
            ball.position.y > aiPaddle.position.y - 1) {
            ballSpeedX *= -1.05;
            ballSpeedY += (ball.position.y - aiPaddle.position.y) * 0.05;
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
renderer.render(scene, camera);
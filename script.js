// --- CONFIGURAÇÃO DE AMBIENTE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let currentLevel = 1;
let unlockedLevels = parseInt(localStorage.getItem('unlockedLevels')) || 1;
let isPaused = false, gameActive = false, infiniteMode = false, brawlMode = false;
let phaseStats = JSON.parse(localStorage.getItem('pixelStats')) || {};

// --- CARREGAMENTO DE ASSETS (SPRITES) ---
const playerSprite = new Image(); playerSprite.src = 'player_sprites.png'; 
const p2Sprite = new Image(); p2Sprite.src = 'p2_skin.png'; // NOVA SKIN P2
const enemySprite = new Image(); enemySprite.src = 'enemy_sprite.png';

let playerLoaded = false; playerSprite.onload = () => playerLoaded = true;
let p2Loaded = false; p2Sprite.onload = () => p2Loaded = true;
let enemyLoaded = false; enemySprite.onload = () => enemyLoaded = true;

// --- OBJETOS DOS JOGADORES (P1 E P2) ---
const p1 = {
    x: 50, y: 50, size: 40, speed: 4, baseSpeed: 4, boostSpeed: 7,
    energy: 100, lives: 3, frameX: 0, frameCount: 0, skill: null, hasShield: false, frozen: 0
};

const p2 = {
    x: 700, y: 400, size: 40, speed: 4, lives: 5, 
    frameX: 0, frameCount: 0, // Sistema de animação para a skin do P2
    skill: null, hasShield: false, frozen: 0
};

const enemyAI = { x: 750, y: 450, size: 40, speed: 1.5, frameX: 0, frameCount: 0 };

// --- VARIÁVEIS DE JOGO ---
let items = [], projectiles = [], obstacles = [];
let levelScore = 0, startTime, totalSeconds = 0;
const keys = {};

const SKILLS_NAMES = [
    "ESCUDO 2S", "VELOCIDADE+", "LASER", "CONGELANTE", "ESPINHOS", 
    "PISTOLA", "ESCUDO MILITAR", "FLASH", "RAIO CIENTISTA", "METEORO"
];

// --- GERENCIAMENTO DE INTERFACE E RESETS ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if(target) target.classList.remove('hidden');
    
    gameActive = (screenId === 'screen-game');
    isPaused = false;
    document.getElementById('pause-menu').classList.add('hidden');
    
    // CORREÇÃO: Reseta o teclado para o boneco não andar sozinho
    for (let key in keys) keys[key] = false; 

    if(screenId === 'screen-levels') renderLevels();
    if(screenId === 'screen-status') renderStatus();
}

function renderLevels() {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.innerText = i <= unlockedLevels ? i : "🔒";
        btn.className = i <= unlockedLevels ? 'level-btn' : 'level-btn locked';
        if(i <= unlockedLevels) btn.onclick = () => { brawlMode = false; infiniteMode = false; currentLevel = i; startGame(); };
        grid.appendChild(btn);
    }
}

function renderStatus() {
    const list = document.getElementById('status-list');
    list.innerHTML = "";
    Object.keys(phaseStats).forEach(lvl => {
        list.innerHTML += `<p>Fase ${lvl}: ${phaseStats[lvl].score} pts - Tempo: ${phaseStats[lvl].time}</p>`;
    });
}

// --- CONTROLE DE PARTIDA ---
function startBrawlMode() { brawlMode = true; infiniteMode = false; startGame(); }
function startInfiniteMode() { brawlMode = false; infiniteMode = true; currentLevel = "INF"; startGame(); }

function startGame() {
    showScreen('screen-game');
    items = []; projectiles = []; obstacles = [];
    levelScore = 0; startTime = Date.now();

    p1.lives = brawlMode ? 5 : 3;
    p2.lives = 5;
    p1.x = 50; p1.y = 50; p1.energy = 100; p1.skill = null; p1.speed = p1.baseSpeed;
    p2.x = 700; p2.y = 400; p2.skill = null; p2.frameX = 0;
    
    enemyAI.x = 750; enemyAI.y = 450;
    enemyAI.speed = infiniteMode ? 2.6 : 1.2 + (currentLevel * 0.3);

    document.getElementById('p2-lives-display').classList.toggle('hidden', !brawlMode);
    document.getElementById('energy-container').style.display = brawlMode ? 'none' : 'block';
    
    spawnInitialItems();
    updateLivesUI();
    gameLoop();
}

function spawnInitialItems() {
    let count = infiniteMode ? 7 : (2 + currentLevel);
    for(let i=0; i < count; i++) spawnItem();
}

function spawnItem() {
    items.push({ x: 100 + Math.random()*600, y: 100 + Math.random()*300, size: 20 });
}

// --- SISTEMA DE COMBATE (TRIGONOMETRIA / TELEGUIADO) ---
function useSkill(player, target) {
    if (!player.skill) return;
    
    const angle = Math.atan2((target.y + target.size/2) - (player.y + player.size/2), (target.x + target.size/2) - (player.x + player.size/2));
    const vx = Math.cos(angle), vy = Math.sin(angle);

    switch(player.skill) {
        case 1: player.hasShield = true; setTimeout(() => player.hasShield = false, 2000); break;
        case 2: player.speed += 0.8; break;
        case 3: spawnProj(player, vx, vy, 0.5, 'red', 11); break;
        case 4: spawnProj(player, vx, vy, 0, 'cyan', 9, true); break;
        case 5: obstacles.push({ x: player.x, y: player.y, size: 40, type: 'spike', life: 200 }); break;
        case 6: spawnProj(player, vx, vy, 1.5, 'orange', 13); break;
        case 7: player.hasShield = true; setTimeout(() => player.hasShield = false, 4500); break;
        case 8: player.speed = 15; setTimeout(() => player.speed = p1.baseSpeed, 3500); break; // FLASH ATUALIZADO
        case 9: spawnProj(player, vx, vy, 2.5, 'lime', 16); break;
        case 10: obstacles.push({ x: target.x, y: -60, tx: target.x, ty: target.y, size: 60, type: 'meteor', life: 120 }); break;
    }
    player.skill = null;
    updateLivesUI();
}

function spawnProj(p, vx, vy, dmg, col, spd, freeze = false) {
    projectiles.push({ x: p.x+20, y: p.y+20, vx: vx*spd, vy: vy*spd, dmg, color: col, freeze, owner: p, size: 12 });
}

// --- MOTOR DE ATUALIZAÇÃO (UPDATE) ---
function update() {
    if (isPaused || !gameActive) return;

    totalSeconds = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('timer-display').innerText = `${Math.floor(totalSeconds/60)}:${(totalSeconds%60).toString().padStart(2, '0')}`;

    // MOVIMENTO P1
    let movingP1 = false;
    if (p1.frozen <= 0) {
        let isBoosting = keys['shift'] && p1.energy > 0 && !brawlMode;
        let s = isBoosting ? p1.boostSpeed : p1.speed;
        
        if (keys['w'] && p1.y > 0) { p1.y -= s; movingP1 = true; }
        if (keys['s'] && p1.y < canvas.height - p1.size) { p1.y += s; movingP1 = true; }
        if (keys['a'] && p1.x > 0) { p1.x -= s; movingP1 = true; }
        if (keys['d'] && p1.x < canvas.width - p1.size) { p1.x += s; movingP1 = true; }
        
        if (isBoosting) p1.energy -= 0.8; else p1.energy = Math.min(100, p1.energy + 0.2);
        document.getElementById('energy-bar').style.width = p1.energy + "%";
    } else p1.frozen--;

    // ANIMAÇÃO P1
    if (movingP1) {
        p1.frameCount++;
        if (p1.frameCount > 8) { p1.frameX = (p1.frameX + 1) % 3; p1.frameCount = 0; }
    } else p1.frameX = 0;

    // LÓGICA MODO BRIGA (P1 VS P2)
    if (brawlMode) {
        let movingP2 = false;
        if (p2.frozen <= 0) {
            if (keys['arrowup'] && p2.y > 0) { p2.y -= p2.speed; movingP2 = true; }
            if (keys['arrowdown'] && p2.y < canvas.height - p2.size) { p2.y += p2.speed; movingP2 = true; }
            if (keys['arrowleft'] && p2.x > 0) { p2.x -= p2.speed; movingP2 = true; }
            if (keys['arrowright'] && p2.x < canvas.width - p2.size) { p2.x += p2.speed; movingP2 = true; }
        } else p2.frozen--;

        // ANIMAÇÃO P2 (SKIN)
        if (movingP2) {
            p2.frameCount++;
            if (p2.frameCount > 8) { p2.frameX = (p2.frameX + 1) % 3; p2.frameCount = 0; }
        } else p2.frameX = 0;

        projectiles.forEach((pr, i) => {
            pr.x += pr.vx; pr.y += pr.vy;
            let target = pr.owner === p1 ? p2 : p1;
            if (checkCollision(pr, target)) {
                if(!target.hasShield) target.lives -= pr.dmg;
                if(pr.freeze) target.frozen = 60;
                projectiles.splice(i, 1); updateLivesUI();
                checkGameOver();
            }
        });
        if (Math.random() < 0.006) spawnItem();
    } else {
        // LÓGICA CAMPANHA / IA
        if (enemyAI.x < p1.x) enemyAI.x += enemyAI.speed; else enemyAI.x -= enemyAI.speed;
        if (enemyAI.y < p1.y) enemyAI.y += enemyAI.speed; else enemyAI.y -= enemyAI.speed;
        
        if (checkCollision(p1, enemyAI)) {
            p1.lives--;
            p1.x = 50; p1.y = 50; enemyAI.x = 750; enemyAI.y = 450; // RESET DE POSIÇÃO
            updateLivesUI();
            checkGameOver();
        }
    }

    // COLETA DE ITENS
    items.forEach((it, i) => {
        if (checkCollision(p1, it)) {
            levelScore += 100;
            if (brawlMode) p1.skill = Math.floor(Math.random()*10)+1;
            else if (infiniteMode) spawnItem(); 
            else if (items.length <= 1) winLevel(); 
            items.splice(i, 1); updateLivesUI();
        }
        if (brawlMode && checkCollision(p2, it)) {
            p2.skill = Math.floor(Math.random()*10)+1;
            items.splice(i, 1); updateLivesUI();
        }
    });

    // OBSTÁCULOS (METEORO / ESPINHOS)
    obstacles.forEach((ob, i) => {
        if(ob.type === 'meteor' && ob.y < ob.ty) ob.y += 6;
        if(checkCollision(p1, ob) && !p1.hasShield) { p1.lives -= 0.02; updateLivesUI(); checkGameOver(); }
        if(brawlMode && checkCollision(p2, ob) && !p2.hasShield) { p2.lives -= 0.02; updateLivesUI(); checkGameOver(); }
        ob.life--; if(ob.life <= 0) obstacles.splice(i, 1);
    });
}

function checkGameOver() {
    if (p1.lives <= 0) { 
        alert(brawlMode ? "PLAYER 2 GANHOU!" : "VOCÊ PERDEU!"); 
        exitGame(); 
    } else if (brawlMode && p2.lives <= 0) { 
        alert("PLAYER 1 GANHOU!"); 
        exitGame(); 
    }
}

// --- DESENHO (DRAW) ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Itens
    ctx.fillStyle = "#f1c40f";
    items.forEach(it => ctx.fillRect(it.x, it.y, it.size, it.size));

    // Player 1 (Com Sprite e Escudo)
    if (playerLoaded) ctx.drawImage(playerSprite, p1.frameX * 32, 0, 32, 32, p1.x, p1.y, p1.size, p1.size);
    if (p1.hasShield) { ctx.strokeStyle = "#00ffff"; ctx.lineWidth = 3; ctx.strokeRect(p1.x-5, p1.y-5, p1.size+10, p1.size+10); }

    // Player 2 / Skin ou Inimigo
    if (brawlMode) {
        if (p2Loaded) {
            ctx.drawImage(p2Sprite, p2.frameX * 32, 0, 32, 32, p2.x, p2.y, p2.size, p2.size);
        } else {
            ctx.fillStyle = p2.frozen > 0 ? "cyan" : "red";
            ctx.fillRect(p2.x, p2.y, p2.size, p2.size);
        }
        if (p2.hasShield) { ctx.strokeStyle = "#ff00ff"; ctx.lineWidth = 3; ctx.strokeRect(p2.x-5, p2.y-5, p2.size+10, p2.size+10); }

        projectiles.forEach(p => { 
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill(); 
        });
    } else if (enemyLoaded) {
        ctx.drawImage(enemySprite, 0, 0, 32, 32, enemyAI.x, enemyAI.y, enemyAI.size, enemyAI.size);
    }

    // Meteoros e Espinhos
    obstacles.forEach(ob => {
        ctx.fillStyle = ob.type === 'spike' ? "#7f8c8d" : "#e67e22";
        ctx.fillRect(ob.x, ob.y, ob.size, ob.size);
    });
}

function updateLivesUI() {
    document.getElementById('lives-display').innerText = "❤️".repeat(Math.max(0, Math.floor(p1.lives)));
    document.getElementById('p1-skill-display').innerText = p1.skill ? "PODER: " + SKILLS_NAMES[p1.skill-1] : "";
    
    if(brawlMode) {
        document.getElementById('p2-lives-display').innerText = "❤️".repeat(Math.max(0, Math.floor(p2.lives)));
        document.getElementById('p2-skill-display').innerText = p2.skill ? "PODER: " + SKILLS_NAMES[p2.skill-1] : "";
        document.getElementById('level-indicator').innerText = "MODO BRIGA";
    } else {
        document.getElementById('level-indicator').innerText = infiniteMode ? "MODO INFINITO" : "Fase " + currentLevel;
    }
    document.getElementById('score-display').innerText = "Pts: " + levelScore;
}

function checkCollision(a, b) { 
    let sA = a.size || 12;
    let sB = b.size || 40;
    return a.x < b.x + sB && a.x + sA > b.x && a.y < b.y + sB && a.y + sA > b.y; 
}

function winLevel() { 
    gameActive = false; 
    phaseStats[currentLevel] = { score: levelScore, time: document.getElementById('timer-display').innerText };
    if(currentLevel === unlockedLevels) unlockedLevels++;
    localStorage.setItem('unlockedLevels', unlockedLevels);
    localStorage.setItem('pixelStats', JSON.stringify(phaseStats));
    alert("FASE CONCLUÍDA!"); 
    showScreen('screen-levels'); 
}

function togglePause() { 
    isPaused = !isPaused; 
    document.getElementById('pause-menu').classList.toggle('hidden', !isPaused); 
}

function exitGame() { gameActive = false; showScreen('screen-menu'); }

function gameLoop() { 
    if (gameActive) { update(); draw(); requestAnimationFrame(gameLoop); } 
}

// --- INPUTS (TECLADO) ---
window.addEventListener('keydown', e => { 
    let key = e.key.toLowerCase();
    keys[key] = true; 
    
    if(key === 'p') togglePause();
    
    if(brawlMode && !isPaused) {
        if(key === 'g') useSkill(p1, p2);
        if(key === 'l') useSkill(p2, p1);
    }
});

window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
});
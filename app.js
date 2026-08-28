let token = localStorage.getItem("qaqlil_token");
let currentUser = null;

const $ = id => document.getElementById(id);

async function api(url, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = "Bearer " + token;
    }

    const res = await fetch(url, {
        ...options,
        headers
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(data.error || "Server xətası");
    }

    return data;
}


/* =========================
   AUTH TABS
========================= */

function showRegister() {
    $("registerForm").classList.remove("hidden");
    $("loginForm").classList.add("hidden");

    $("registerTab").className = "btn primary";
    $("loginTab").className = "btn secondary";

    $("authError").textContent = "";
}

function showLogin() {
    $("registerForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");

    $("registerTab").className = "btn secondary";
    $("loginTab").className = "btn primary";

    $("authError").textContent = "";
}


/* =========================
   REGISTER
========================= */

async function register() {

    const username =
        $("registerUsername").value.trim();

    const code =
        $("registerCode").value.trim();

    if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) {
        $("authError").textContent =
            "İstifadəçi adı 3-18 simvol olmalıdır.";
        return;
    }

    if (!/^[A-Za-z0-9]{4,10}$/.test(code)) {
        $("authError").textContent =
            "Kod 4-10 hərf və rəqəmdən ibarət olmalıdır.";
        return;
    }

    const button =
        document.querySelector("#registerForm button");

    button.disabled = true;
    button.textContent = "YARADILIR...";

    try {

        const data = await api("/api/register", {
            method: "POST",
            body: JSON.stringify({
                username,
                code
            })
        });

        token = data.token;

        localStorage.setItem(
            "qaqlil_token",
            token
        );

        await enterGame();

    } catch (err) {

        $("authError").textContent =
            err.message;

        button.disabled = false;
        button.textContent = "🚀 HESAB YARAT";
    }
}


/* =========================
   LOGIN
========================= */

async function login() {

    const username =
        $("loginUsername").value.trim();

    const code =
        $("loginCode").value.trim();

    if (!username || !code) {
        $("authError").textContent =
            "İstifadəçi adı və kodu yaz.";
        return;
    }

    const button =
        document.querySelector("#loginForm button");

    button.disabled = true;
    button.textContent = "DAXİL OLUNUR...";

    try {

        const data = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                username,
                code
            })
        });

        token = data.token;

        localStorage.setItem(
            "qaqlil_token",
            token
        );

        await enterGame();

    } catch (err) {

        $("authError").textContent =
            err.message;

        button.disabled = false;
        button.textContent = "🔥 DAXİL OL";
    }
}


/* =========================
   ENTER GAME
========================= */

async function enterGame() {

    currentUser =
        await api("/api/me");

    $("authPage").classList.add("hidden");
    $("gamePage").classList.remove("hidden");

    $("username").textContent =
        currentUser.username;

    $("totalXP").textContent =
        Number(currentUser.xp).toLocaleString();

    $("best").textContent =
        Number(currentUser.best_distance).toLocaleString();

    loadLeaderboard();

    restartGame();
}


/* =========================
   LEADERBOARD
========================= */

async function loadLeaderboard() {

    const box = $("leaderboard");

    try {

        const data =
            await api("/api/leaderboard");

        box.innerHTML = "";

        data.players.forEach((player, index) => {

            const row =
                document.createElement("div");

            row.className = "leader";

            if (
                currentUser &&
                player.username === currentUser.username
            ) {
                row.classList.add("myRank");
            }

            row.innerHTML = `
                <span class="rank">
                    ${index + 1}
                </span>

                <span class="player">
                    ${escapeHTML(player.username)}
                </span>

                <span class="xp">
                    ${Number(player.xp).toLocaleString()} XP
                </span>
            `;

            box.appendChild(row);
        });

    } catch (err) {

        box.innerHTML =
            "<div class='leader'>Leaderboard yüklənmədi.</div>";

        console.error(err);
    }
}


function escapeHTML(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================
   GAME
========================= */

const canvas =
    document.getElementById("gameCanvas");

const ctx =
    canvas.getContext("2d");

let gameRunning = false;
let gameEnded = false;
let lastTime = 0;
let distance = 0;
let runXP = 0;
let speed = 6;
let obstacleTimer = 70;
let obstacles = [];

const groundY = 375;

const player = {
    x: 120,
    y: groundY - 130,
    width: 90,
    height: 130,
    velocityY: 0,
    onGround: true
};


function jump() {

    if (gameEnded) {
        restartGame();
        return;
    }

    if (player.onGround) {

        player.velocityY = -17;
        player.onGround = false;

        if (!gameRunning) {
            startGame();
        }
    }
}


function startGame() {

    if (gameRunning) return;

    gameRunning = true;
    lastTime = performance.now();

    requestAnimationFrame(gameLoop);
}


function restartGame() {

    gameRunning = false;
    gameEnded = false;

    distance = 0;
    runXP = 0;
    speed = 6;
    obstacleTimer = 70;
    obstacles = [];

    player.y = groundY - player.height;
    player.velocityY = 0;
    player.onGround = true;

    $("gameOver").style.display = "none";

    updateGameUI();
    draw();

    startGame();
}


function createObstacle() {

    const height =
        35 + Math.random() * 80;

    const width =
        35 + Math.random() * 20;

    obstacles.push({
        x: canvas.width,
        y: groundY - height,
        width,
        height
    });

    obstacleTimer =
        65 + Math.random() * 90;
}


function collision(a, b) {

    return (
        a.x + 22 < b.x + b.width &&
        a.x + a.width - 20 > b.x &&
        a.y + 15 < b.y + b.height &&
        a.y + a.height - 15 > b.y
    );
}


function gameLoop(time) {

    if (!gameRunning) return;

    const delta =
        Math.min(
            2,
            (time - lastTime) / 16.666
        );

    lastTime = time;

    player.velocityY +=
        0.82 * delta;

    player.y +=
        player.velocityY * delta;

    if (
        player.y >=
        groundY - player.height
    ) {
        player.y =
            groundY - player.height;

        player.velocityY = 0;
        player.onGround = true;
    }

    speed +=
        0.0025 * delta;

    distance +=
        speed * 0.12 * delta;

    runXP =
        Math.floor(distance / 5);

    obstacleTimer -= delta;

    if (obstacleTimer <= 0) {
        createObstacle();
    }

    for (const obstacle of obstacles) {
        obstacle.x -= speed * delta;
    }

    obstacles =
        obstacles.filter(
            o => o.x > -100
        );

    for (const obstacle of obstacles) {

        if (collision(player, obstacle)) {
            gameOver();
            return;
        }
    }

    updateGameUI();
    draw();

    requestAnimationFrame(gameLoop);
}


async function gameOver() {

    gameRunning = false;
    gameEnded = true;

    const finalDistance =
        Math.floor(distance);

    const earned =
        Math.floor(finalDistance / 5);

    $("finalDistance").textContent =
        finalDistance + " M";

    $("earnedXP").textContent =
        "+" + earned + " XP";

    $("gameOver").style.display =
        "flex";

    try {

        const result =
            await api("/api/score", {
                method: "POST",
                body: JSON.stringify({
                    distance: finalDistance
                })
            });

        currentUser = result;

        $("totalXP").textContent =
            Number(result.xp).toLocaleString();

        $("best").textContent =
            Number(result.best_distance).toLocaleString();

        await loadLeaderboard();

    } catch (err) {

        console.error(
            "XP save error:",
            err
        );
    }
}


function updateGameUI() {

    $("distance").textContent =
        Math.floor(distance);

    $("runXP").textContent =
        runXP;
}


/* =========================
   DRAW
========================= */

function draw() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const sky =
        ctx.createLinearGradient(
            0,
            0,
            0,
            groundY
        );

    sky.addColorStop(0, "#10195c");
    sky.addColorStop(.55, "#7048b5");
    sky.addColorStop(1, "#ff9569");

    ctx.fillStyle = sky;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        groundY
    );


    /* STARS */

    ctx.fillStyle = "#ffffff";

    for (let i = 0; i < 60; i++) {

        const x = (i * 157) % 900;
        const y = (i * 71) % 300;

        ctx.globalAlpha =
            .3 + (i % 4) * .12;

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            1.2,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;


    /* MOON */

    ctx.fillStyle = "#fff1b0";

    ctx.beginPath();

    ctx.arc(
        760,
        85,
        40,
        0,
        Math.PI * 2
    );

    ctx.fill();


    /* CITY */

    ctx.fillStyle = "#252952";

    for (let i = 0; i < 14; i++) {

        const x = i * 72;
        const height =
            45 + (i % 5) * 25;

        ctx.fillRect(
            x,
            groundY - height,
            52,
            height
        );
    }


    /* ROAD */

    ctx.fillStyle = "#101827";

    ctx.fillRect(
        0,
        groundY,
        900,
        125
    );


    /* GREEN LINE */

    ctx.fillStyle = "#39ff70";

    ctx.fillRect(
        0,
        groundY,
        900,
        3
    );


    /* ROAD MARKS */

    ctx.fillStyle = "#27334b";

    for (let i = 0; i < 900; i += 55) {

        ctx.fillRect(
            i,
            420,
            27,
            5
        );
    }


    /* OBSTACLES */

    for (const obstacle of obstacles) {

        ctx.fillStyle = "#302050";

        ctx.fillRect(
            obstacle.x,
            obstacle.y,
            obstacle.width,
            obstacle.height
        );

        ctx.fillStyle = "#ff3b91";

        ctx.fillRect(
            obstacle.x - 4,
            obstacle.y,
            obstacle.width + 8,
            7
        );
    }


    /* PLAYER */

    ctx.fillStyle = "#0006";

    ctx.beginPath();

    ctx.ellipse(
        player.x + 45,
        379,
        43,
        7,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();


    /* BODY */

    ctx.fillStyle = "#10151e";

    ctx.fillRect(
        player.x + 22,
        player.y + 55,
        50,
        58
    );


    /* ARMS */

    ctx.fillStyle = "#202a3b";

    ctx.fillRect(
        player.x + 8,
        player.y + 70,
        18,
        43
    );

    ctx.fillRect(
        player.x + 70,
        player.y + 70,
        18,
        43
    );


    /* SHOES */

    ctx.fillStyle = "#090c12";

    ctx.fillRect(
        player.x + 25,
        player.y + 108,
        21,
        9
    );

    ctx.fillRect(
        player.x + 61,
        player.y + 108,
        21,
        9
    );


    /* HEAD */

    ctx.fillStyle = "#b97961";

    ctx.beginPath();

    ctx.arc(
        player.x + 47,
        player.y + 31,
        30,
        0,
        Math.PI * 2
    );

    ctx.fill();


    /* HAIR */

    ctx.fillStyle = "#17191f";

    ctx.fillRect(
        player.x + 18,
        player.y + 4,
        58,
        24
    );


    /* EYES */

    ctx.fillStyle = "#17191f";

    ctx.fillRect(
        player.x + 28,
        player.y + 31,
        8,
        4
    );

    ctx.fillRect(
        player.x + 58,
        player.y + 31,
        8,
        4
    );
}


/* =========================
   BUTTONS
========================= */

document
    .getElementById("registerTab")
    .addEventListener("click", showRegister);

document
    .getElementById("loginTab")
    .addEventListener("click", showLogin);

document
    .querySelector("#registerForm button")
    .addEventListener("click", register);

document
    .querySelector("#loginForm button")
    .addEventListener("click", login);

document
    .getElementById("jumpButton")
    .addEventListener("pointerdown", e => {
        e.preventDefault();
        jump();
    });

canvas.addEventListener(
    "pointerdown",
    e => {
        e.preventDefault();
        jump();
    }
);

document.addEventListener(
    "keydown",
    e => {

        if (
            e.code === "Space" ||
            e.code === "ArrowUp"
        ) {

            e.preventDefault();
            jump();
        }
    }
);


/* =========================
   AUTO LOGIN
========================= */

async function checkLogin() {

    if (!token) return;

    try {

        currentUser =
            await api("/api/me");

        await enterGame();

    } catch {

        localStorage.removeItem(
            "qaqlil_token"
        );

        token = null;
    }
}


draw();
checkLogin();

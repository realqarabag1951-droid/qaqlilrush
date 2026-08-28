const encoder = new TextEncoder();

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=UTF-8",
            ...CORS_HEADERS
        }
    });
}

function createToken() {
    return crypto.randomUUID() + "-" + crypto.randomUUID();
}

async function hash(text) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(text)
    );

    return Array.from(new Uint8Array(buffer))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function validUsername(username) {
    return /^[A-Za-z0-9_]{3,18}$/.test(username);
}

function validCode(code) {
    return /^[A-Za-z0-9]{4,10}$/.test(code);
}

async function getUser(request, env) {
    const authorization = request.headers.get("Authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.slice(7).trim();

    if (!token) {
        return null;
    }

    const user = await env.DB.prepare(`
        SELECT
            u.id,
            u.username,
            u.xp,
            u.best_distance
        FROM sessions s
        INNER JOIN users u
            ON u.id = s.user_id
        WHERE s.token = ?
          AND s.expires_at > ?
        LIMIT 1
    `)
        .bind(token, Date.now())
        .first();

    return user || null;
}

export default {
    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);

        try {

            /* =========================================
               HEALTH
            ========================================= */

            if (
                url.pathname === "/api/health" &&
                request.method === "GET"
            ) {
                return json({
                    ok: true,
                    game: "QAQLIL RUSH",
                    server: "online"
                });
            }


            /* =========================================
               REGISTER
            ========================================= */

            if (
                url.pathname === "/api/register" &&
                request.method === "POST"
            ) {

                let body;

                try {
                    body = await request.json();
                } catch {
                    return json({
                        ok: false,
                        error: "Göndərilən məlumat düzgün deyil."
                    }, 400);
                }

                const username = String(body?.username || "").trim();
                const code = String(body?.code || "").trim();

                if (!validUsername(username)) {
                    return json({
                        ok: false,
                        error: "İstifadəçi adı 3-18 simvol olmalıdır."
                    }, 400);
                }

                if (!validCode(code)) {
                    return json({
                        ok: false,
                        error: "Kod 4-10 hərf və rəqəmdən ibarət olmalıdır."
                    }, 400);
                }

                const existingUser = await env.DB.prepare(`
                    SELECT id
                    FROM users
                    WHERE username = ?
                    LIMIT 1
                `)
                    .bind(username)
                    .first();

                if (existingUser) {
                    return json({
                        ok: false,
                        error: "Bu istifadəçi adı artıq istifadə olunur."
                    }, 409);
                }

                const userId = crypto.randomUUID();
                const token = createToken();

                const codeHash = await hash(code);

                const now = Date.now();

                const expiresAt =
                    now + 1000 * 60 * 60 * 24 * 30;

                await env.DB.prepare(`
                    INSERT INTO users (
                        id,
                        username,
                        code_hash,
                        xp,
                        best_distance,
                        created_at
                    )
                    VALUES (?, ?, ?, 0, 0, ?)
                `)
                    .bind(
                        userId,
                        username,
                        codeHash,
                        now
                    )
                    .run();

                await env.DB.prepare(`
                    INSERT INTO sessions (
                        token,
                        user_id,
                        expires_at
                    )
                    VALUES (?, ?, ?)
                `)
                    .bind(
                        token,
                        userId,
                        expiresAt
                    )
                    .run();

                return json({
                    ok: true,
                    token: token
                });
            }


            /* =========================================
               LOGIN
            ========================================= */

            if (
                url.pathname === "/api/login" &&
                request.method === "POST"
            ) {

                let body;

                try {
                    body = await request.json();
                } catch {
                    return json({
                        ok: false,
                        error: "Göndərilən məlumat düzgün deyil."
                    }, 400);
                }

                const username = String(body?.username || "").trim();
                const code = String(body?.code || "").trim();

                if (!username || !code) {
                    return json({
                        ok: false,
                        error: "İstifadəçi adı və kodu yaz."
                    }, 400);
                }

                const user = await env.DB.prepare(`
                    SELECT
                        id,
                        username,
                        code_hash
                    FROM users
                    WHERE username = ?
                    LIMIT 1
                `)
                    .bind(username)
                    .first();

                if (!user) {
                    return json({
                        ok: false,
                        error: "İstifadəçi adı və ya kod yanlışdır."
                    }, 401);
                }

                const codeHash = await hash(code);

                if (codeHash !== user.code_hash) {
                    return json({
                        ok: false,
                        error: "İstifadəçi adı və ya kod yanlışdır."
                    }, 401);
                }

                const token = createToken();

                const expiresAt =
                    Date.now() + 1000 * 60 * 60 * 24 * 30;

                await env.DB.prepare(`
                    INSERT INTO sessions (
                        token,
                        user_id,
                        expires_at
                    )
                    VALUES (?, ?, ?)
                `)
                    .bind(
                        token,
                        user.id,
                        expiresAt
                    )
                    .run();

                return json({
                    ok: true,
                    token: token
                });
            }


            /* =========================================
               CURRENT USER
            ========================================= */

            if (
                url.pathname === "/api/me" &&
                request.method === "GET"
            ) {

                const user = await getUser(request, env);

                if (!user) {
                    return json({
                        ok: false,
                        error: "Giriş edilməyib."
                    }, 401);
                }

                return json({
                    ok: true,
                    username: user.username,
                    xp: user.xp,
                    best_distance: user.best_distance
                });
            }


            /* =========================================
               SAVE SCORE
            ========================================= */

            if (
                url.pathname === "/api/score" &&
                request.method === "POST"
            ) {

                const user = await getUser(request, env);

                if (!user) {
                    return json({
                        ok: false,
                        error: "Giriş edilməyib."
                    }, 401);
                }

                let body;

                try {
                    body = await request.json();
                } catch {
                    return json({
                        ok: false,
                        error: "Göndərilən məlumat düzgün deyil."
                    }, 400);
                }

                const distance = Math.floor(
                    Number(body?.distance)
                );

                if (
                    !Number.isFinite(distance) ||
                    distance < 0 ||
                    distance > 10000000
                ) {
                    return json({
                        ok: false,
                        error: "Yanlış nəticə."
                    }, 400);
                }

                const earnedXP = Math.floor(distance / 5);

                await env.DB.prepare(`
                    UPDATE users
                    SET
                        xp = xp + ?,
                        best_distance = MAX(best_distance, ?)
                    WHERE id = ?
                `)
                    .bind(
                        earnedXP,
                        distance,
                        user.id
                    )
                    .run();

                const updatedUser =
                    await env.DB.prepare(`
                        SELECT
                            username,
                            xp,
                            best_distance
                        FROM users
                        WHERE id = ?
                        LIMIT 1
                    `)
                        .bind(user.id)
                        .first();

                return json({
                    ok: true,
                    username: updatedUser.username,
                    xp: updatedUser.xp,
                    best_distance: updatedUser.best_distance,
                    earnedXP: earnedXP
                });
            }


            /* =========================================
               LEADERBOARD
            ========================================= */

            if (
                url.pathname === "/api/leaderboard" &&
                request.method === "GET"
            ) {

                const result = await env.DB.prepare(`
                    SELECT
                        username,
                        xp,
                        best_distance
                    FROM users
                    ORDER BY
                        xp DESC,
                        best_distance DESC
                    LIMIT 100
                `)
                    .all();

                return json({
                    ok: true,
                    players: result.results || []
                });
            }


            /* =========================================
               WEBSITE / ASSETS
            ========================================= */

            if (env.ASSETS) {
                return env.ASSETS.fetch(request);
            }

            return new Response(
                "QAQLIL RUSH",
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/plain; charset=UTF-8",
                        ...CORS_HEADERS
                    }
                }
            );

        } catch (error) {

            console.error("SERVER ERROR:", error);

            return json({
                ok: false,
                error: "Server xətası baş verdi."
            }, 500);
        }
    }
};

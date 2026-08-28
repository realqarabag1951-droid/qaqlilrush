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
            "Content-Type": "application/json",
            ...CORS_HEADERS
        }
    });
}

async function hash(text) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(text)
    );

    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
}

function createToken() {
    return crypto.randomUUID() + "-" + crypto.randomUUID();
}

function validUsername(username) {
    return /^[A-Za-z0-9_]{3,18}$/.test(username);
}

function validCode(code) {
    return /^[A-Za-z0-9]{4,10}$/.test(code);
}


/* =========================
   USER AUTH
========================= */

async function getUser(request, env) {

    const auth =
        request.headers.get("Authorization");

    if (!auth || !auth.startsWith("Bearer ")) {
        return null;
    }

    const token = auth.slice(7);

    const user =
        await env.DB.prepare(`
            SELECT
                u.id,
                u.username,
                u.xp,
                u.best_distance
            FROM sessions s
            JOIN users u
                ON u.id = s.user_id
            WHERE s.token = ?
              AND s.expires_at > ?
        `)
        .bind(token, Date.now())
        .first();

    return user || null;
}


/* =========================
   MAIN WORKER
========================= */

export default {

    async fetch(request, env) {

        /* OPTIONS / CORS */

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url =
            new URL(request.url);


        try {

            /* =================================
               REGISTER
            ================================= */

            if (
                url.pathname === "/api/register" &&
                request.method === "POST"
            ) {

                const body =
                    await request.json();

                const username =
                    String(body.username || "")
                        .trim();

                const code =
                    String(body.code || "")
                        .trim();


                if (!validUsername(username)) {

                    return json({
                        error:
                            "Istifadeci adi 3-18 simvol olmalidir."
                    }, 400);

                }


                if (!validCode(code)) {

                    return json({
                        error:
                            "Giris kodu 4-10 herf ve reqem olmalidir."
                    }, 400);

                }


                const exists =
                    await env.DB.prepare(`
                        SELECT id
                        FROM users
                        WHERE username = ?
                    `)
                    .bind(username)
                    .first();


                if (exists) {

                    return json({
                        error:
                            "Bu istifadeci adi artiq istifade olunur."
                    }, 409);

                }


                const codeHash =
                    await hash(code);

                const userId =
                    crypto.randomUUID();

                const token =
                    createToken();

                const now =
                    Date.now();

                const expires =
                    now +
                    1000 * 60 * 60 * 24 * 30;


                await env.DB.batch([

                    env.DB.prepare(`
                        INSERT INTO users
                        (
                            id,
                            username,
                            code_hash,
                            xp,
                            best_distance,
                            created_at
                        )
                        VALUES
                        (?, ?, ?, 0, 0, ?)
                    `)
                    .bind(
                        userId,
                        username,
                        codeHash,
                        now
                    ),

                    env.DB.prepare(`
                        INSERT INTO sessions
                        (
                            token,
                            user_id,
                            expires_at
                        )
                        VALUES
                        (?, ?, ?)
                    `)
                    .bind(
                        token,
                        userId,
                        expires
                    )

                ]);


                return json({
                    ok: true,
                    token
                });

            }


            /* =================================
               LOGIN
            ================================= */

            if (
                url.pathname === "/api/login" &&
                request.method === "POST"
            ) {

                const body =
                    await request.json();

                const username =
                    String(body.username || "")
                        .trim();

                const code =
                    String(body.code || "")
                        .trim();


                const user =
                    await env.DB.prepare(`
                        SELECT
                            id,
                            username,
                            code_hash
                        FROM users
                        WHERE username = ?
                    `)
                    .bind(username)
                    .first();


                if (!user) {

                    return json({
                        error:
                            "Istifadeci adi ve ya kod yanlisdir."
                    }, 401);

                }


                const codeHash =
                    await hash(code);


                if (
                    codeHash !== user.code_hash
                ) {

                    return json({
                        error:
                            "Istifadeci adi ve ya kod yanlisdir."
                    }, 401);

                }


                const token =
                    createToken();

                const expires =
                    Date.now() +
                    1000 * 60 * 60 * 24 * 30;


                await env.DB.prepare(`
                    INSERT INTO sessions
                    (
                        token,
                        user_id,
                        expires_at
                    )
                    VALUES
                    (?, ?, ?)
                `)
                .bind(
                    token,
                    user.id,
                    expires
                )
                .run();


                return json({
                    ok: true,
                    token
                });

            }


            /* =================================
               CURRENT USER
            ================================= */

            if (
                url.pathname === "/api/me" &&
                request.method === "GET"
            ) {

                const user =
                    await getUser(
                        request,
                        env
                    );


                if (!user) {

                    return json({
                        error:
                            "Giris edilmemisdir."
                    }, 401);

                }


                return json({
                    username:
                        user.username,

                    xp:
                        user.xp,

                    best_distance:
                        user.best_distance
                });

            }


            /* =================================
               SAVE SCORE
            ================================= */

            if (
                url.pathname === "/api/score" &&
                request.method === "POST"
            ) {

                const user =
                    await getUser(
                        request,
                        env
                    );


                if (!user) {

                    return json({
                        error:
                            "Giris edilmemisdir."
                    }, 401);

                }


                const body =
                    await request.json();

                const distance =
                    Math.floor(
                        Number(body.distance)
                    );


                if (
                    !Number.isFinite(distance) ||
                    distance < 0 ||
                    distance > 10000000
                ) {

                    return json({
                        error:
                            "Yanlis netice."
                    }, 400);

                }


                /*
                    Hər run-dan XP qazanılır.

                    100 metr  = 20 XP
                    500 metr  = 100 XP
                    5000 metr = 1000 XP
                */

                const earnedXP =
                    Math.floor(
                        distance / 5
                    );


                /*
                    XP toplanır.

                    Əvvəl:
                    500000 XP

                    + yeni 1000 XP

                    = 501000 XP


                    Best distance isə
                    yalnız daha böyük nəticə
                    gələndə dəyişir.
                */

                await env.DB.prepare(`
                    UPDATE users

                    SET
                        xp = xp + ?,

                        best_distance =
                            MAX(
                                best_distance,
                                ?
                            )

                    WHERE id = ?
                `)
                .bind(
                    earnedXP,
                    distance,
                    user.id
                )
                .run();


                const updated =
                    await env.DB.prepare(`
                        SELECT
                            username,
                            xp,
                            best_distance
                        FROM users
                        WHERE id = ?
                    `)
                    .bind(user.id)
                    .first();


                return json({
                    ok: true,
                    ...updated,
                    earnedXP
                });

            }


            /* =================================
               GLOBAL LEADERBOARD
            ================================= */

            if (
                url.pathname === "/api/leaderboard" &&
                request.method === "GET"
            ) {

                const result =
                    await env.DB.prepare(`
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
                    players:
                        result.results
                });

            }


            /* =================================
               HEALTH CHECK
            ================================= */

            if (
                url.pathname === "/api/health"
            ) {

                return json({
                    ok: true,
                    game: "QAQLIL RUSH",
                    server: "online"
                });

            }


            /* =================================
               WEBSITE
            ================================= */

            /*
                API deyilsə,
                GitHub-dakı index.html
                Cloudflare Assets vasitəsilə açılır.
            */

            if (env.ASSETS) {

                return env.ASSETS.fetch(
                    request
                );

            }


            return new Response(
                "QAQLIL RUSH is online!",
                {
                    status: 200,
                    headers: CORS_HEADERS
                }
            );


        } catch (error) {

            console.error(
                "SERVER ERROR:",
                error
            );

            return json({
                error:
                    "Server xetasi bas verdi."
            }, 500);

        }

    }

};

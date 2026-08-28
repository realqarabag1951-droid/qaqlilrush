const encoder = new TextEncoder();

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
    });
}

async function hash(text) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(text)
    );

    return [...new Uint8Array(buffer)]
        .map(byte => byte.toString(16).padStart(2, "0"))
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
   LOGIN EDƏN İSTİFADƏÇİNİ TAP
========================= */

async function getUser(request, env) {

    const authorization =
        request.headers.get("Authorization");

    if (
        !authorization ||
        !authorization.startsWith("Bearer ")
    ) {
        return null;
    }

    const token =
        authorization.substring(7);

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
        .bind(
            token,
            Date.now()
        )
        .first();

    return user || null;
}


/* =========================
   SERVER
========================= */

export default {

    async fetch(request, env) {

        /* CORS */

        if (request.method === "OPTIONS") {
            return json({
                ok: true
            });
        }


        const url =
            new URL(request.url);


        try {

            /* =================================
               HESAB YARAT
            ================================= */

            if (
                url.pathname === "/api/register" &&
                request.method === "POST"
            ) {

                const body =
                    await request.json();

                const username =
                    String(
                        body.username || ""
                    ).trim();

                const code =
                    String(
                        body.code || ""
                    ).trim();


                if (
                    !validUsername(username)
                ) {

                    return json({
                        error:
                            "Istifadeci adi 3-18 simvol olmalidir. Yalniz herf, reqem ve _ istifade et."
                    }, 400);

                }


                if (
                    !validCode(code)
                ) {

                    return json({
                        error:
                            "Giris kodu 4-10 herf ve ya reqem olmalidir."
                    }, 400);

                }


                /* USERNAME YOXLAMA */

                const exists =
                    await env.DB
                    .prepare(`
                        SELECT id
                        FROM users
                        WHERE username = ?
                    `)
                    .bind(username)
                    .first();


                if (exists) {

                    return json({
                        error:
                            "Bu istifadeci adi artiq movcuddur."
                    }, 409);

                }


                /* KODU HASH ET */

                const codeHash =
                    await hash(code);


                const userId =
                    crypto.randomUUID();

                const sessionToken =
                    createToken();

                const now =
                    Date.now();


                /* DATABASE */

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
                        sessionToken,
                        userId,
                        now +
                        1000 * 60 * 60 * 24 * 30
                    )

                ]);


                return json({
                    token: sessionToken
                });

            }


            /* =================================
               DAXIL OL
            ================================= */

            if (
                url.pathname === "/api/login" &&
                request.method === "POST"
            ) {

                const body =
                    await request.json();

                const username =
                    String(
                        body.username || ""
                    ).trim();

                const code =
                    String(
                        body.code || ""
                    ).trim();


                const user =
                    await env.DB
                    .prepare(`
                        SELECT
                            id,
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
                    codeHash !==
                    user.code_hash
                ) {

                    return json({
                        error:
                            "Istifadeci adi ve ya kod yanlisdir."
                    }, 401);

                }


                const sessionToken =
                    createToken();


                await env.DB
                    .prepare(`
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
                        sessionToken,
                        user.id,
                        Date.now() +
                        1000 * 60 * 60 * 24 * 30
                    )
                    .run();


                return json({
                    token: sessionToken
                });

            }


            /* =================================
               PROFIL
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
                            "Unauthorized"
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
               OYUN NƏTİCƏSİ
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
                            "Unauthorized"
                    }, 401);

                }


                const body =
                    await request.json();


                const distance =
                    Number(
                        body.distance
                    );


                if (
                    !Number.isFinite(distance) ||
                    distance < 0
                ) {

                    return json({
                        error:
                            "Yanlis oyun neticesi."
                    }, 400);

                }


                /*
                XP MƏNTİQİ

                Məsələn:

                100 metr
                = 20 XP

                5000 metr
                = 1000 XP
                */

                const earnedXP =
                    Math.floor(
                        distance / 5
                    );


                /*
                ÇOX VACİB:

                Əvvəlki XP heç vaxt
                aşağı nəticəyə görə
                silinmir.

                500000 XP varsa:

                yeni nəticə 100 XP
                → 500000 qalır.

                yeni nəticə 700000 XP
                → 700000 olur.
                */


                await env.DB
                    .prepare(`
                        UPDATE users

                        SET

                            xp =
                                MAX(
                                    xp,
                                    ?
                                ),

                            best_distance =
                                MAX(
                                    best_distance,
                                    ?
                                )

                        WHERE id = ?
                    `)
                    .bind(
                        earnedXP,
                        Math.floor(distance),
                        user.id
                    )
                    .run();


                const updated =
                    await env.DB
                    .prepare(`
                        SELECT
                            username,
                            xp,
                            best_distance
                        FROM users
                        WHERE id = ?
                    `)
                    .bind(user.id)
                    .first();


                return json(
                    updated
                );

            }


            /* =================================
               REAL LEADERBOARD
            ================================= */

            if (
                url.pathname === "/api/leaderboard" &&
                request.method === "GET"
            ) {

                const result =
                    await env.DB
                    .prepare(`
                        SELECT
                            username,
                            xp,
                            best_distance
                        FROM users
                        ORDER BY
                            xp DESC,
                            best_distance DESC,
                            created_at ASC
                        LIMIT 100
                    `)
                    .all();


                return json(
                    result.results
                );

            }


            /* =================================
               SERVER TEST
            ================================= */

            return json({

                status: "online",

                game: "QAQLIL RUSH",

                message:
                    "QAQLIL RUSH server is running 🚀"

            });


        } catch (error) {

            console.error(error);

            return json({

                error:
                    "Server xetasi."

            }, 500);

        }

    }

};

export class GameRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;

        this.players = new Map();
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname !== "/ws") {
            return new Response("QAQLIL RUSH GAME SERVER", {
                status: 200
            });
        }

        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket connection required", {
                status: 426
            });
        }

        const pair = new WebSocketPair();

        const client = pair[0];
        const server = pair[1];

        server.accept();

        const playerId = crypto.randomUUID();

        let playerName = "Player";

        const player = {
            id: playerId,
            name: playerName,
            distance: 0
        };

        this.players.set(playerId, {
            socket: server,
            player
        });

        server.send(
            JSON.stringify({
                type: "connected",
                id: playerId
            })
        );

        this.broadcastPlayers();

        server.addEventListener("message", async event => {
            try {
                const data = JSON.parse(event.data);

                /* =========================
                   SET NAME
                ========================= */

                if (data.type === "setName") {
                    const name =
                        String(data.name || "")
                            .trim()
                            .replace(/[<>]/g, "");

                    if (
                        name.length < 1 ||
                        name.length > 18
                    ) {
                        server.send(
                            JSON.stringify({
                                type: "error",
                                message:
                                    "Ad 1-18 simvol olmalıdır."
                            })
                        );

                        return;
                    }

                    player.name = name;

                    this.broadcastPlayers();

                    return;
                }


                /* =========================
                   UPDATE DISTANCE
                ========================= */

                if (data.type === "distance") {
                    let distance =
                        Math.floor(
                            Number(data.distance)
                        );

                    if (!Number.isFinite(distance)) {
                        return;
                    }

                    distance =
                        Math.max(
                            0,
                            Math.min(
                                distance,
                                10000000
                            )
                        );

                    player.distance = distance;

                    this.broadcastPlayers();

                    return;
                }


                /* =========================
                   RESET DISTANCE
                ========================= */

                if (data.type === "reset") {
                    player.distance = 0;

                    this.broadcastPlayers();

                    return;
                }

            } catch (error) {
                console.error(
                    "MESSAGE ERROR:",
                    error
                );
            }
        });


        server.addEventListener("close", () => {
            this.removePlayer(playerId);
        });


        server.addEventListener("error", () => {
            this.removePlayer(playerId);
        });


        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }


    /* =========================
       REMOVE PLAYER
    ========================= */

    removePlayer(id) {
        this.players.delete(id);

        this.broadcastPlayers();
    }


    /* =========================
       BROADCAST PLAYERS
    ========================= */

    broadcastPlayers() {
        const players = [];

        for (const item of this.players.values()) {
            players.push({
                id: item.player.id,
                name: item.player.name,
                distance: item.player.distance
            });
        }


        players.sort(
            (a, b) =>
                b.distance - a.distance
        );


        const message =
            JSON.stringify({
                type: "players",
                players
            });


        for (const item of this.players.values()) {
            try {
                item.socket.send(message);
            } catch (error) {
                console.error(
                    "SEND ERROR:",
                    error
                );
            }
        }
    }
}


/* =====================================================
   WORKER
===================================================== */

export default {

    async fetch(request, env) {

        const url =
            new URL(request.url);


        /* =========================
           CORS
        ========================= */

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods":
                        "GET,POST,OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Content-Type"
                }
            });
        }


        /* =========================
           HEALTH
        ========================= */

        if (url.pathname === "/api/health") {
            return new Response(
                JSON.stringify({
                    ok: true,
                    game: "QAQLIL RUSH",
                    online: true
                }),
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "application/json",
                        "Access-Control-Allow-Origin":
                            "*"
                    }
                }
            );
        }


        /* =========================
           WEBSOCKET GAME ROOM
        ========================= */

        if (url.pathname === "/ws") {

            const roomId =
                env.GAME_ROOM.idFromName(
                    "main-room"
                );

            const room =
                env.GAME_ROOM.get(roomId);

            return room.fetch(request);
        }


        /* =========================
           WEBSITE
        ========================= */

        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }


        return new Response(
            "QAQLIL RUSH is online!",
            {
                status: 200
            }
        );
    }
};

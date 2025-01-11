# Slicey

This was for a [Cloudflare](https://x.com/CloudflareDevs) Hack Week project to produce an educational game that we could use at [live events](https://meet-us.pages.dev) to help describe [Durable Objects](https://developers.cloudflare.com/durable-objects). It started as an attempt to build Fruit Ninja.

It uses your phone for a controller, which is something I've always wanted. This was 100% built with OpenAI GPT4o + Canvas. I went into this not knowing how to build something like this, so AI really opened things up for me. All I knew was the word tween.

AI even generated this Mermaid diagram:

```mermaid
sequenceDiagram
    participant Phone as Phone
    participant DO as Game Durable Object
    participant Display as Display Screen


    Phone->>DO: Connect via WebSocket<br>Send: {event: "phone_connected", id: "PhoneID"}
    DO->>Phone: Assign color<br>{event: "assign_color", color: "#HEX"}

    Display->>DO: Connect via WebSocket<br>Send: {event: "display_connected"}
    DO->>Display: Send game state<br>{event: "game_updated", players, solution, obstacles}

    Phone->>DO: Update name<br>Send: {event: "update_name", id: "PhoneID", playerName: "NewName"}
    DO->>Display: Broadcast updated leaderboard<br>{event: "game_updated", players}

    Phone->>DO: Report movement<br>Send: {event: "player_moved", id: "PhoneID", x, y}
    DO->>DO: Handle collision with obstacles
    DO->>Phone: Points earned<br>Send: {event: "points_earned", points}

    DO->>Display: Update game state<br>Send: {event: "game_updated", solution, obstacles}

    Display->>DO: Add sentence<br>Send: {event: "sentence_added", sentence: "New Sentence"}
    DO->>DO: Update obstacles and solution
    DO->>Display: Notify sentence update<br>Send: {event: "game_updated", solution, obstacles}

    Note over DO: All state changes are stored in Durable Object's SQLite
```

**It is a bonkers time to be a builder!**

## TODO

- [ ] Make specific for events
- [ ] Add tracking (for reporting on events)

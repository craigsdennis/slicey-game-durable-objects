# Slicey

This was a Hack Week project to produce a live event educational tool for Durable Objects that is loosely based on Fruit Ninja.

It uses your phone for a controller.

```mermaid
sequenceDiagram
    participant Phone as Phone
    participant DO as Game Durable Object
    participant Display as Display Screen

    Note over Phone,DO,Display: WebSocket-based communication

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

## TODO

- [ ] Make specific for events

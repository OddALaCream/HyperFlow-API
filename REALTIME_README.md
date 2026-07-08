# HiperFlow Realtime Voice Assistant

## Configuracion

1. Copie `.env.example` a `.env`.
2. Configure:

```bash
OPENAI_API_KEY=tu_api_key_aqui
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
OPENAI_REALTIME_VOICE=marin
```

La API key solo se usa en el backend. El frontend recibe un `client_secret` efimero desde:

```http
POST /api/realtime/session
```

## Ejecutar

Backend:

```bash
cd HiperFlow-API
npm run dev
```

Frontend:

```bash
cd HiperFlow-Frontend/PortalHipermaxi-Frontend
npm run dev
```

Luego abra `http://localhost:5173` y presione `Hablar con IA`.

## Notas

- El frontend se conecta a OpenAI Realtime por WebRTC usando el token efimero.
- Las acciones visuales se ejecutan por medio del MCP local `ui-automation-mcp`.
- Flujo de tools: OpenAI Realtime -> DataChannel frontend -> WebSocket backend -> MCP client -> MCP server -> WebSocket frontend -> DOM.
- El modelo solo recibe resumen compacto de pagina, campos, botones, secciones y errores visibles. No se envia todo el DOM.
- Si falta `OPENAI_API_KEY`, el backend devuelve un error claro sin exponer secretos.

## MCP UI automation

Servidor MCP local:

```text
ui-automation-mcp
```

Endpoint para inspeccionar tools disponibles:

```http
GET /api/mcp/ui-automation/tools
```

WebSocket usado por el bridge frontend/backend:

```text
ws://localhost:3001/ws/ui-automation
```

Tools principales:

- `ui_get_page_context`
- `ui_get_form_state`
- `ui_find_field`
- `ui_focus_field`
- `ui_highlight_field`
- `ui_show_tooltip`
- `ui_fill_field`
- `ui_click_button`
- `ui_validate_form`
- `ui_go_to_next_error`
- `ui_show_steps`
- `ui_clear_assistant_ui`
- `ui_scroll_to_section`
- `ui_explain_field`
- `ui_autofill_from_user_message`
- `ui_perform_task`

Uso esperado:

1. La IA llama `ui_get_page_context` o `ui_find_field` cuando no sabe donde esta el usuario.
2. El frontend devuelve un resumen compacto con labels humanos y `elementId` interno.
3. La IA usa ese `elementId` con `ui_focus_field`, `ui_fill_field`, `ui_click_button`, etc.
4. El usuario solo escucha explicaciones naturales; no se le muestran IDs tecnicos.

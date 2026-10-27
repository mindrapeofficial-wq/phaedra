/**
 * Phaedra's small Stoat client. Protocol: REST + Bonfire v1 JSON events.
 * Credentials stay in memory. In particular, WebSocket URLs never carry tokens.
 * Reference: github.com/stoatchat/stoatchat, API /auth/session and Bonfire v1.
 */

export class StoatError extends Error {
  constructor(code, message, { status, backendType, retryAfterMs } = {}) {
    super(message);
    this.name = "StoatError";
    this.code = code;
    this.status = status;
    this.backendType = backendType;
    this.retryAfterMs = retryAfterMs;
  }
}

const error = (code, message, details) => new StoatError(code, message, details);
const cancelled = () => error("CANCELLED", "La conexión se ha cancelado.");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const timer = (callback, delay) => {
  const handle = setTimeout(callback, delay);
  handle.unref?.();
  return handle;
};

function detailEvent(type, detail) {
  if (typeof CustomEvent !== "undefined") return new CustomEvent(type, { detail });
  const event = new Event(type);
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

function checkedUrl(input, { websocket = false } = {}) {
  let url;
  try { url = new URL(input); } catch { throw error("INVALID_URL", "La dirección del servidor no es válida."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const secure = websocket ? "wss:" : "https:";
  const local = websocket ? "ws:" : "http:";
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== secure && !(loopback && url.protocol === local))) {
    throw error("UNSAFE_URL", "Usa HTTPS para el servidor; HTTP solo está permitido en localhost.");
  }
  return url;
}

function httpOrigin(url) {
  const value = new URL(url);
  if (value.protocol === "wss:") value.protocol = "https:";
  if (value.protocol === "ws:") value.protocol = "http:";
  return value.origin;
}

function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw error("INVALID_ID", "El identificador no es válido.");
  }
  return encodeURIComponent(value);
}

function backendError(response, data) {
  const backendType = typeof data?.type === "string" && /^[A-Za-z0-9_]{1,64}$/.test(data.type) ? data.type : undefined;
  const messages = {
    InvalidCredentials: "El correo o la contraseña no son correctos.",
    InvalidSession: "La sesión ha caducado. Vuelve a iniciar sesión.",
    UnverifiedAccount: "Verifica el correo de tu cuenta antes de iniciar sesión.",
    LockedOut: "La cuenta está bloqueada temporalmente. Espera antes de intentarlo otra vez.",
    MissingPermission: "Tu cuenta no tiene permiso para esta acción.",
    CannotMessageUser: "Este usuario no admite mensajes de tu cuenta.",
    TooManyRequests: "Se ha alcanzado el límite de solicitudes. Espera antes de intentarlo de nuevo.",
    FileTooLarge: "El archivo supera el límite permitido por el servidor.",
  };
  const status = response?.status;
  const code = backendType === "InvalidSession" || status === 401 ? "AUTHENTICATION_FAILED" :
    status === 429 || backendType === "TooManyRequests" ? "RATE_LIMITED" :
    status === 403 ? "FORBIDDEN" : "API_ERROR";
  const retryAfter = Number(response?.headers?.get("retry-after"));
  return error(code, messages[backendType] || (status === 403 ? "Tu cuenta no tiene permiso para esta acción." :
    status === 429 ? messages.TooManyRequests : "El servidor no ha podido completar la solicitud."), {
    status, backendType, retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
  });
}

export class StoatClient extends EventTarget {
  channels = new Map();
  users = new Map();
  servers = new Map();
  currentUser = null;
  configuration = null;
  registrationUrl = null;
  status = "offline";

  #fetch;
  #WebSocket;
  #options;
  #apiUrl = null;
  #wsUrl = null;
  #autumnUrl = null;
  #allowedOrigins = new Set();
  #session = null;
  #socket = null;
  #generation = 0;
  #controllers = new Set();
  #reconnectTimer = null;
  #heartbeatTimer = null;
  #pongTimer = null;
  #pendingReject = null;
  #reconnectAttempt = 0;
  #messages = new Map();

  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), WebSocketImpl = globalThis.WebSocket,
    allowedServiceOrigins = [], requestTimeoutMs = 15000, heartbeatMs = 30000,
    pongTimeoutMs = 10000, reconnectBaseMs = 1000, reconnectMaxMs = 30000 } = {}) {
    super();
    this.#fetch = fetchImpl;
    this.#WebSocket = WebSocketImpl;
    this.#options = { allowedServiceOrigins, requestTimeoutMs, heartbeatMs, pongTimeoutMs, reconnectBaseMs, reconnectMaxMs };
  }

  get apiUrl() { return this.#apiUrl; }

  async connect({ apiUrl, email, password, allowedServiceOrigins } = {}) {
    const generation = this.#begin(apiUrl, allowedServiceOrigins);
    this.#state("authenticating");
    try {
      if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        throw error("MISSING_CREDENTIALS", "Introduce el correo y la contraseña.");
      }
      await this.#discover(generation);
      const session = await this.#request("/auth/session/login", {
        method: "POST", authenticated: false,
        body: { email: email.trim(), password, friendly_name: "Phaedra Social" },
      }, generation);
      if (session?.result === "MFA") throw error("MFA_REQUIRED", "Esta versión de Phaedra Social todavía no admite verificación en dos pasos. Usa el cliente de tu servidor para esta cuenta.");
      if (session?.result === "Disabled") throw error("ACCOUNT_DISABLED", "Esta cuenta está desactivada.");
      if (session?.result !== "Success" || typeof session.token !== "string" || !session.token) {
        throw error("INVALID_RESPONSE", "El servidor no ha devuelto una sesión válida.");
      }
      this.#session = { token: session.token, user_id: session.user_id, _id: session._id };
      await this.#prepareUser(generation);
      await this.#openSocket(generation);
    } catch (failure) { this.#connectionFailure(failure, generation); throw failure; }
  }

  async resume({ apiUrl, token, allowedServiceOrigins } = {}) {
    const generation = this.#begin(apiUrl, allowedServiceOrigins);
    this.#state("authenticating");
    try {
      if (typeof token !== "string" || !token || /[\r\n]/.test(token)) throw error("INVALID_TOKEN", "La sesión no es válida.");
      await this.#discover(generation);
      this.#session = { token };
      await this.#prepareUser(generation);
      await this.#openSocket(generation);
    } catch (failure) { this.#connectionFailure(failure, generation); throw failure; }
  }

  /** Disconnect deliberately; reconnect never survives this call. */
  disconnect() {
    this.#reset();
    this.#state("offline");
  }

  async logout() {
    const generation = this.#generation;
    try { if (this.#session) await this.#request("/auth/session/logout", { method: "POST" }, generation); }
    finally { if (generation === this.#generation) this.disconnect(); }
  }

  async getMessages(channelId, { limit = 50, before } = {}) {
    const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, Number(limit) || 50))), include_users: "true" });
    if (before) params.set("before", identifier(before));
    const result = await this.#request(`/channels/${identifier(channelId)}/messages?${params}`);
    const messages = Array.isArray(result) ? result : result?.messages;
    if (!Array.isArray(messages)) throw error("INVALID_RESPONSE", "El servidor no ha devuelto el historial esperado.");
    for (const user of result?.users ?? []) this.#put(this.users, user);
    for (const message of messages) this.#remember(message);
    return messages.slice().sort((a, b) => String(a._id).localeCompare(String(b._id)));
  }

  async sendMessage(channelId, { content = "", attachments = [] } = {}) {
    if (typeof content !== "string" || !Array.isArray(attachments) || (!content.trim() && attachments.length === 0)) {
      throw error("EMPTY_MESSAGE", "Escribe un mensaje o adjunta un archivo.");
    }
    attachments.forEach(identifier);
    const key = globalThis.crypto?.randomUUID?.();
    if (!key) throw error("CRYPTO_UNAVAILABLE", "El entorno no permite generar un identificador seguro para el envío.");
    try {
      const message = await this.#request(`/channels/${identifier(channelId)}/messages`, {
        method: "POST", body: { content, attachments }, headers: { "Idempotency-Key": key },
      });
      if (!message?._id) throw error("INVALID_RESPONSE", "El servidor no ha confirmado el mensaje.");
      this.#remember(message);
      return message;
    } catch (failure) {
      if (["NETWORK_ERROR", "TIMEOUT"].includes(failure.code)) {
        throw error("SEND_UNCONFIRMED", "No se ha podido confirmar el envío. Comprueba el historial antes de reenviar.");
      }
      throw failure;
    }
  }

  async openDirectMessage(userId) {
    const channel = await this.#request(`/users/${identifier(userId)}/dm`);
    if (!channel?._id) throw error("INVALID_RESPONSE", "El servidor no ha devuelto una conversación válida.");
    this.#put(this.channels, channel);
    this.#emit("channel", channel);
    return channel;
  }

  async addFriend(username) {
    if (typeof username !== "string" || !username.trim()) throw error("INVALID_USERNAME", "Introduce el nombre y discriminador del usuario.");
    const user = await this.#request("/users/friend", { method: "POST", body: { username: username.trim() } });
    this.#put(this.users, user);
    this.#emit("user", user);
    return user;
  }

  async uploadFile(file) {
    if (!this.#autumnUrl || !this.#session) throw error("UPLOAD_UNAVAILABLE", "Este servidor no tiene subida de archivos disponible.");
    if (!file || typeof file.size !== "number" || !file.size) throw error("EMPTY_FILE", "El archivo está vacío.");
    const body = new FormData();
    body.append("file", file, file.name || "audio");
    const result = await this.#fetchJson(`${this.#autumnUrl}/attachments`, {
      method: "POST", body, headers: { "X-Session-Token": this.#session.token },
    });
    if (typeof result?.id !== "string" || !result.id) throw error("INVALID_RESPONSE", "El servidor no ha confirmado la subida del archivo.");
    return result.id;
  }

  fileUrl(attachment, { original = true } = {}) {
    if (!this.#autumnUrl || !attachment?._id) return "";
    const tag = ["attachments", "avatars", "backgrounds", "icons", "banners", "emojis"].includes(attachment.tag) ? attachment.tag : "attachments";
    const base = `${this.#autumnUrl}/${tag}/${identifier(attachment._id)}`;
    return original ? `${base}/original` : base;
  }

  #emit(type, detail) { this.dispatchEvent(detailEvent(type, detail)); }
  #state(status, failure) {
    this.status = status;
    this.#emit("state", { status, ...(failure ? { error: failure } : {}) });
  }
  #put(map, object) {
    if (isObject(object) && typeof object._id === "string") {
      map.set(object._id, object);
      if (map === this.users && object._id === this.currentUser?._id) this.currentUser = object;
    }
  }
  #remember(message) {
    this.#put(this.#messages, message);
    while (this.#messages.size > 1000) this.#messages.delete(this.#messages.keys().next().value);
  }

  #begin(apiUrl, allowedServiceOrigins) {
    this.#reset();
    try {
      const url = checkedUrl(apiUrl);
      this.#apiUrl = url.href.replace(/\/$/, "");
      this.#allowedOrigins = new Set([url.origin]);
      const extra = allowedServiceOrigins ?? this.#options.allowedServiceOrigins;
      if (!Array.isArray(extra)) throw error("INVALID_URL", "La lista de servidores permitidos no es válida.");
      for (const origin of extra) this.#allowedOrigins.add(checkedUrl(origin).origin);
      return this.#generation;
    } catch (failure) {
      this.#state("error", failure);
      throw failure;
    }
  }

  #serviceUrl(input, websocket = false) {
    const url = checkedUrl(input, { websocket });
    if (!this.#allowedOrigins.has(httpOrigin(url))) {
      throw error("UNTRUSTED_SERVICE", "El servidor anuncia otro origen. Añádelo a los orígenes permitidos antes de enviarle credenciales.");
    }
    return url.href.replace(/\/$/, "");
  }

  async #discover(generation) {
    if (!this.#fetch || !this.#WebSocket) throw error("UNSUPPORTED_RUNTIME", "Este entorno no dispone de conexión web compatible.");
    const config = await this.#request("/", { authenticated: false }, generation);
    if (!isObject(config) || typeof config.ws !== "string" || !isObject(config.features)) {
      throw error("INVALID_SERVER", "La dirección no corresponde a una API de Stoat compatible.");
    }
    this.#wsUrl = this.#serviceUrl(config.ws, true);
    if (config.features.autumn?.enabled && config.features.autumn.url) {
      this.#autumnUrl = this.#serviceUrl(config.features.autumn.url);
    }
    if (config.app) {
      try { this.registrationUrl = this.#serviceUrl(config.app); } catch { this.registrationUrl = null; }
    }
    this.configuration = config;
  }

  async #prepareUser(generation) {
    const onboarding = await this.#request("/onboard/hello", {}, generation);
    if (onboarding?.onboarding) throw error("ONBOARDING_REQUIRED", "Completa el nombre de tu cuenta en el cliente de tu servidor y vuelve a conectar.");
    const user = await this.#request("/users/@me", {}, generation);
    if (!user?._id) throw error("INVALID_RESPONSE", "El servidor no ha devuelto tu perfil.");
    this.#session.user_id = user._id;
    this.currentUser = user;
    this.#put(this.users, user);
  }

  async #request(path, { method = "GET", body, authenticated = true, headers = {} } = {}, generation = this.#generation) {
    if (!this.#apiUrl) throw error("NOT_CONNECTED", "Conecta con tu servidor antes de continuar.");
    if (authenticated && !this.#session) throw error("NOT_CONNECTED", "Inicia sesión antes de continuar.");
    const requestHeaders = { Accept: "application/json", ...headers };
    if (authenticated) requestHeaders["X-Session-Token"] = this.#session.token;
    if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
    return this.#fetchJson(this.#apiUrl + path, { method, headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, generation);
  }

  async #fetchJson(url, options, generation = this.#generation) {
    const controller = new AbortController();
    this.#controllers.add(controller);
    let timedOut = false;
    const timeout = timer(() => { timedOut = true; controller.abort(); }, this.#options.requestTimeoutMs);
    try {
      const response = await this.#fetch(url, { ...options, signal: controller.signal,
        credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
      if (generation !== this.#generation) throw cancelled();
      if (response.status === 204) return null;
      if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") || "")) {
        throw error("UNEXPECTED_RESPONSE", "El servidor ha devuelto una página en lugar de JSON. Comprueba la URL de su API.", { status: response.status });
      }
      let data;
      try { data = await response.json(); } catch {
        if (timedOut) throw error("TIMEOUT", "El servidor ha tardado demasiado en responder.");
        if (controller.signal.aborted) throw cancelled();
        throw error("INVALID_RESPONSE", "La respuesta del servidor no es válida.");
      }
      if (generation !== this.#generation) throw cancelled();
      if (!response.ok) throw backendError(response, data);
      return data;
    } catch (failure) {
      if (generation !== this.#generation) throw cancelled();
      if (failure instanceof StoatError) {
        if (failure.code === "AUTHENTICATION_FAILED" && this.#session) this.#connectionFailure(failure, generation);
        throw failure;
      }
      throw timedOut ? error("TIMEOUT", "El servidor ha tardado demasiado en responder.") :
        controller.signal.aborted ? cancelled() : error("NETWORK_ERROR", "No se ha podido contactar con el servidor. Comprueba la dirección y la conexión.");
    } finally {
      clearTimeout(timeout);
      this.#controllers.delete(controller);
    }
  }

  #openSocket(generation, reconnecting = false) {
    if (generation !== this.#generation || !this.#session) return Promise.reject(cancelled());
    this.#state(reconnecting ? "reconnecting" : "connecting");
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket;
      const finish = (failure) => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimeout);
        if (this.#pendingReject === fail) this.#pendingReject = null;
        failure ? reject(failure) : resolve();
      };
      const fail = (failure) => finish(failure);
      const readyTimeout = timer(() => {
        finish(error("READY_TIMEOUT", "La conexión no ha recibido los datos iniciales del servidor."));
        if (this.#socket === socket) { this.#socket = null; socket?.close(); }
      }, this.#options.requestTimeoutMs);
      this.#pendingReject = fail;
      const url = new URL(this.#wsUrl);
      url.searchParams.set("version", "1");
      url.searchParams.set("format", "json");
      try { socket = new this.#WebSocket(url.href); } catch {
        finish(error("NETWORK_ERROR", "No se ha podido abrir la conexión en tiempo real."));
        return;
      }
      this.#socket = socket;
      const active = () => generation === this.#generation && this.#socket === socket;
      socket.onopen = () => {
        if (!active()) return;
        try { socket.send(JSON.stringify({ type: "Authenticate", token: this.#session.token })); }
        catch { socket.close(); }
      };
      socket.onmessage = ({ data }) => {
        if (!active()) return;
        try {
          if (typeof data !== "string" || data.length > 8 * 1024 * 1024) throw error("PROTOCOL_ERROR", "El servidor ha enviado datos de conexión no válidos.");
          const packet = JSON.parse(data);
          const ready = this.#event(packet);
          if (ready) {
            this.#reconnectAttempt = 0;
            this.#state("online");
            this.#startHeartbeat(socket);
            finish();
            this.#emit("ready", { currentUser: this.currentUser, channels: this.channels, users: this.users });
          }
        } catch (failure) {
          const safe = failure instanceof StoatError ? failure : error("PROTOCOL_ERROR", "La conexión ha recibido una respuesta no válida.");
          finish(safe);
          this.#connectionFailure(safe, generation);
        }
      };
      socket.onerror = () => { /* Close/timeout determines whether reconnect is appropriate. */ };
      socket.onclose = () => {
        if (!active()) return;
        this.#socket = null;
        this.#clearHeartbeat();
        if (!settled) finish(error("CONNECTION_CLOSED", "El servidor ha cerrado la conexión antes de completarla."));
        else this.#scheduleReconnect(generation);
      };
    });
  }

  #event(packet, depth = 0) {
    if (!isObject(packet) || typeof packet.type !== "string" || depth > 8) throw error("PROTOCOL_ERROR", "El evento del servidor no es válido.");
    if (packet.type === "Bulk") {
      if (!Array.isArray(packet.v) || packet.v.length > 10000) throw error("PROTOCOL_ERROR", "El lote de eventos del servidor no es válido.");
      let ready = false;
      for (const item of packet.v) ready = this.#event(item, depth + 1) || ready;
      return ready;
    }
    if (packet.type === "Error") throw backendError(null, packet.data);
    if (packet.type === "Ready") {
      for (const [key, map] of [["channels", this.channels], ["users", this.users], ["servers", this.servers]]) {
        if (Array.isArray(packet[key])) { map.clear(); packet[key].forEach((item) => this.#put(map, item)); }
      }
      this.currentUser = this.users.get(this.#session.user_id) ?? this.currentUser;
      if (this.currentUser) this.#put(this.users, this.currentUser);
      return true;
    }
    if (packet.type === "Ping") this.#socket?.send(JSON.stringify({ type: "Pong", data: packet.data }));
    if (packet.type === "Pong") { clearTimeout(this.#pongTimer); this.#pongTimer = null; }
    if (packet.type === "Message") {
      const { type, ...message } = packet;
      this.#remember(message);
      this.#emit("message", message);
    }
    if (packet.type === "MessageUpdate") {
      const previous = this.#messages.get(packet.id);
      if (previous) { const message = { ...previous, ...packet.data, _id: packet.id }; this.#remember(message); this.#emit("message", message); }
    }
    if (packet.type === "MessageDelete" || packet.type === "BulkMessageDelete") {
      const ids = packet.type === "MessageDelete" ? [packet.id] : packet.ids;
      for (const id of ids ?? []) { this.#messages.delete(id); this.#emit("messageDelete", { id, channel: packet.channel }); }
    }
    if (packet.type === "ChannelCreate") { const { type, ...channel } = packet; this.#put(this.channels, channel); this.#emit("channel", channel); }
    if (packet.type === "ChannelUpdate") this.#patch(this.channels, packet, "channel");
    if (packet.type === "ChannelDelete") { this.channels.delete(packet.id); this.#emit("channelDelete", { id: packet.id }); }
    if (packet.type === "UserUpdate") this.#patch(this.users, packet, "user");
    if (packet.type === "UserPresence") {
      const user = { ...this.users.get(packet.id), _id: packet.id, online: !!packet.online };
      this.#put(this.users, user); this.#emit("user", user); this.#emit("presence", user);
    }
    if (packet.type === "UserRelationship") {
      const user = { ...this.users.get(packet.user?._id), ...packet.user, relationship: packet.status ?? packet.user?.relationship };
      this.#put(this.users, user); this.#emit("user", user);
    }
    if (packet.type === "ServerCreate") {
      this.#put(this.servers, packet.server);
      for (const channel of packet.channels ?? []) { this.#put(this.channels, channel); this.#emit("channel", channel); }
    }
    if (packet.type === "ServerUpdate") this.#patch(this.servers, packet, "server");
    if (packet.type === "ServerDelete") { this.servers.delete(packet.id); this.#emit("serverDelete", { id: packet.id }); }
    if (packet.type === "Auth" && ((packet.event_type === "DeleteSession" && (!this.#session._id || packet.session_id === this.#session._id)) ||
        (packet.event_type === "DeleteAllSessions" && (!this.#session._id || packet.exclude_session_id !== this.#session._id)))) {
      throw error("AUTHENTICATION_FAILED", "La sesión se ha revocado. Vuelve a iniciar sesión.");
    }
    return false;
  }

  #patch(map, packet, eventName) {
    const previous = map.get(packet.id) ?? { _id: packet.id };
    const object = { ...previous, ...packet.data, _id: packet.id };
    for (const nested of ["status", "profile"]) if (isObject(packet.data?.[nested])) object[nested] = { ...previous[nested], ...packet.data[nested] };
    const fields = { Avatar: "avatar", Icon: "icon", Description: "description", DisplayName: "display_name", StatusText: "status.text", StatusPresence: "status.presence", ProfileContent: "profile.content", ProfileBackground: "profile.background" };
    for (const clear of packet.clear ?? []) {
      const parts = fields[clear]?.split(".");
      if (parts?.length === 1) delete object[parts[0]];
      if (parts?.length === 2 && object[parts[0]]) { object[parts[0]] = { ...object[parts[0]] }; delete object[parts[0]][parts[1]]; }
    }
    this.#put(map, object);
    if (map === this.users && object._id === this.currentUser?._id) this.currentUser = object;
    this.#emit(eventName, object);
  }

  #startHeartbeat(socket) {
    this.#clearHeartbeat();
    const beat = () => {
      if (this.#socket !== socket) return;
      try { socket.send(JSON.stringify({ type: "Ping", data: Date.now() })); } catch { socket.close(); return; }
      this.#pongTimer = timer(() => socket.close(), this.#options.pongTimeoutMs);
      this.#heartbeatTimer = timer(beat, this.#options.heartbeatMs);
    };
    this.#heartbeatTimer = timer(beat, this.#options.heartbeatMs);
  }

  #clearHeartbeat() {
    clearTimeout(this.#heartbeatTimer); clearTimeout(this.#pongTimer);
    this.#heartbeatTimer = null; this.#pongTimer = null;
  }

  #scheduleReconnect(generation) {
    if (generation !== this.#generation || !this.#session || this.#reconnectTimer) return;
    this.#state("reconnecting");
    const delay = Math.min(this.#options.reconnectMaxMs, this.#options.reconnectBaseMs * 2 ** Math.min(this.#reconnectAttempt++, 8));
    this.#reconnectTimer = timer(() => {
      this.#reconnectTimer = null;
      this.#openSocket(generation, true).catch(() => this.#scheduleReconnect(generation));
    }, delay);
  }

  #connectionFailure(failure, generation) {
    if (generation !== this.#generation) return;
    this.#reset({ keepConfiguration: true });
    this.#state("error", failure instanceof StoatError ? failure : error("CONNECTION_ERROR", "No se ha podido completar la conexión."));
  }

  #reset({ keepConfiguration = false } = {}) {
    this.#generation++;
    clearTimeout(this.#reconnectTimer); this.#reconnectTimer = null;
    this.#clearHeartbeat();
    this.#pendingReject?.(cancelled()); this.#pendingReject = null;
    const socket = this.#socket; this.#socket = null; socket?.close();
    for (const controller of this.#controllers) controller.abort();
    this.#controllers.clear();
    this.#session = null; this.#reconnectAttempt = 0;
    this.channels.clear(); this.users.clear(); this.servers.clear(); this.#messages.clear(); this.currentUser = null;
    if (!keepConfiguration) {
      this.#apiUrl = null; this.#wsUrl = null; this.#autumnUrl = null;
      this.configuration = null; this.registrationUrl = null;
    }
  }
}

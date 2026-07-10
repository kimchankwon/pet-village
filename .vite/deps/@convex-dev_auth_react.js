"use client";
import {
  ConvexHttpClient,
  ConvexProviderWithAuth
} from "./chunk-AYTM3KUM.js";
import {
  require_react
} from "./chunk-CRLOJGAK.js";
import "./chunk-6ZC3IMYJ.js";
import {
  __commonJS,
  __toESM
} from "./chunk-G3PMV62Z.js";

// node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.development.js"(exports) {
    "use strict";
    (function() {
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children)
          if (isStaticChildren)
            if (isArrayImpl(children)) {
              for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)
                validateChildKeys(children[isStaticChildren]);
              Object.freeze && Object.freeze(children);
            } else
              console.error(
                "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
              );
          else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
          children = getComponentNameFromType(type);
          var keys = Object.keys(config).filter(function(k) {
            return "key" !== k;
          });
          isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
          didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error(
            'A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />',
            isStaticChildren,
            children,
            keys,
            children
          ), didWarnAboutKeySpread[children + isStaticChildren] = true);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
          maybeKey = {};
          for (var propName in config)
            "key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(
          maybeKey,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        return ReactElement(
          type,
          children,
          maybeKey,
          getOwner(),
          debugStack,
          debugTask
        );
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      var React = require_react(), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      React = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(
        React,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutKeySpread = {};
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.jsx = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          false,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.jsxs = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          true,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
    })();
  }
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_react_jsx_runtime_development();
    }
  }
});

// node_modules/@convex-dev/auth/dist/react/index.js
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var import_react3 = __toESM(require_react());

// node_modules/@convex-dev/auth/dist/react/client.js
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var import_react = __toESM(require_react(), 1);

// node_modules/is-network-error/index.js
var objectToString = Object.prototype.toString;
var isError = (value) => objectToString.call(value) === "[object Error]";
var errorMessages = /* @__PURE__ */ new Set([
  "network error",
  // Chrome
  "NetworkError when attempting to fetch resource.",
  // Firefox
  "The Internet connection appears to be offline.",
  // Safari 16
  "Network request failed",
  // `cross-fetch`
  "fetch failed",
  // Undici (Node.js)
  "terminated",
  // Undici (Node.js)
  " A network error occurred.",
  // Bun (WebKit)
  "Network connection lost"
  // Cloudflare Workers (fetch)
]);
function isNetworkError(error) {
  const isValid = error && isError(error) && error.name === "TypeError" && typeof error.message === "string";
  if (!isValid) {
    return false;
  }
  const { message, stack } = error;
  if (message === "Load failed" || message.startsWith("Load failed (") && message.endsWith(")")) {
    return stack === void 0 || "__sentry_captured__" in error;
  }
  if (message.startsWith("error sending request for url")) {
    return true;
  }
  if (message === "Failed to fetch" || message.startsWith("Failed to fetch (") && message.endsWith(")")) {
    return true;
  }
  return errorMessages.has(message);
}

// node_modules/@convex-dev/auth/dist/react/client.js
var RETRY_BACKOFF = [500, 2e3];
var RETRY_JITTER = 100;
var ConvexAuthActionsContext = (0, import_react.createContext)(void 0);
var ConvexAuthInternalContext = (0, import_react.createContext)(void 0);
function useAuth() {
  return (0, import_react.useContext)(ConvexAuthInternalContext);
}
var ConvexAuthTokenContext = (0, import_react.createContext)(null);
var VERIFIER_STORAGE_KEY = "__convexAuthOAuthVerifier";
var JWT_STORAGE_KEY = "__convexAuthJWT";
var REFRESH_TOKEN_STORAGE_KEY = "__convexAuthRefreshToken";
var SERVER_STATE_FETCH_TIME_STORAGE_KEY = "__convexAuthServerStateFetchTime";
function AuthProvider({ client, serverState, onChange, shouldHandleCode, storage, storageNamespace, replaceURL, children }) {
  const token = (0, import_react.useRef)((serverState == null ? void 0 : serverState._state.token) ?? null);
  const [isLoading, setIsLoading] = (0, import_react.useState)(token.current === null);
  const [tokenState, setTokenState] = (0, import_react.useState)(token.current);
  const verbose = client.verbose ?? false;
  const logVerbose = (0, import_react.useCallback)((message) => {
    var _a;
    if (verbose) {
      console.debug(`${(/* @__PURE__ */ new Date()).toISOString()} ${message}`);
      (_a = client.logger) == null ? void 0 : _a.logVerbose(message);
    }
  }, [verbose]);
  const { storageSet, storageGet, storageRemove, storageKey } = useNamespacedStorage(storage, storageNamespace);
  const [isRefreshingToken, setIsRefreshingToken] = (0, import_react.useState)(false);
  const setToken = (0, import_react.useCallback)(async (args) => {
    const wasAuthenticated = token.current !== null;
    let newToken;
    if (args.tokens === null) {
      token.current = null;
      if (args.shouldStore) {
        await storageRemove(JWT_STORAGE_KEY);
        await storageRemove(REFRESH_TOKEN_STORAGE_KEY);
      }
      newToken = null;
    } else {
      const { token: value } = args.tokens;
      token.current = value;
      if (args.shouldStore) {
        const { refreshToken } = args.tokens;
        await storageSet(JWT_STORAGE_KEY, value);
        await storageSet(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      }
      newToken = value;
    }
    if (wasAuthenticated !== (newToken !== null)) {
      await (onChange == null ? void 0 : onChange());
    }
    setTokenState(newToken);
    setIsLoading(false);
  }, [storageSet, storageRemove]);
  (0, import_react.useEffect)(() => {
    const listener = async (e) => {
      if (isRefreshingToken) {
        e.preventDefault();
        const confirmationMessage = "Are you sure you want to leave? Your changes may not be saved.";
        e.returnValue = true;
        return confirmationMessage;
      }
    };
    browserAddEventListener("beforeunload", listener);
    return () => {
      browserRemoveEventListener("beforeunload", listener);
    };
  });
  (0, import_react.useEffect)(() => {
    const listener = (event) => {
      void (async () => {
        if (event.storageArea !== storage) {
          return;
        }
        if (event.key === storageKey(JWT_STORAGE_KEY)) {
          const value = event.newValue;
          logVerbose(`synced access token, is null: ${value === null}`);
          await setToken({
            shouldStore: false,
            tokens: value === null ? null : { token: value }
          });
        }
      })();
    };
    browserAddEventListener("storage", listener);
    return () => browserRemoveEventListener("storage", listener);
  }, [setToken]);
  const verifyCode = (0, import_react.useCallback)(async (args) => {
    let lastError;
    let retry = 0;
    while (retry < RETRY_BACKOFF.length) {
      try {
        return await client.unauthenticatedCall("auth:signIn", "code" in args ? { params: { code: args.code }, verifier: args.verifier } : args);
      } catch (e) {
        lastError = e;
        if (!isNetworkError(e)) {
          break;
        }
        const wait = RETRY_BACKOFF[retry] + RETRY_JITTER * Math.random();
        retry++;
        logVerbose(`verifyCode failed with network error, retry ${retry} of ${RETRY_BACKOFF.length} in ${wait}ms`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    throw lastError;
  }, [client]);
  const verifyCodeAndSetToken = (0, import_react.useCallback)(async (args) => {
    const { tokens } = await verifyCode(args);
    logVerbose(`retrieved tokens, is null: ${tokens === null}`);
    await setToken({ shouldStore: true, tokens: tokens ?? null });
    return tokens !== null;
  }, [client, setToken]);
  const signIn = (0, import_react.useCallback)(async (provider, args) => {
    const params = args instanceof FormData ? Array.from(args.entries()).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {}) : args ?? {};
    const verifier = await storageGet(VERIFIER_STORAGE_KEY) ?? void 0;
    await storageRemove(VERIFIER_STORAGE_KEY);
    const result = await client.authenticatedCall("auth:signIn", { provider, params, verifier });
    if (result.redirect !== void 0) {
      const url = new URL(result.redirect);
      await storageSet(VERIFIER_STORAGE_KEY, result.verifier);
      if (navigator.product !== "ReactNative") {
        window.location.href = url.toString();
      }
      return { signingIn: false, redirect: url };
    } else if (result.tokens !== void 0) {
      const { tokens } = result;
      logVerbose(`signed in and got tokens, is null: ${tokens === null}`);
      await setToken({ shouldStore: true, tokens });
      return { signingIn: result.tokens !== null };
    }
    return { signingIn: false };
  }, [client, setToken, storageGet]);
  const signOut = (0, import_react.useCallback)(async () => {
    try {
      await client.authenticatedCall("auth:signOut");
    } catch (error) {
    }
    logVerbose(`signed out, erasing tokens`);
    await setToken({ shouldStore: true, tokens: null });
  }, [setToken, client]);
  const fetchAccessToken = (0, import_react.useCallback)(async ({ forceRefreshToken }) => {
    if (forceRefreshToken) {
      const tokenBeforeLockAquisition = token.current;
      return await browserMutex(REFRESH_TOKEN_STORAGE_KEY, async () => {
        const tokenAfterLockAquisition = token.current;
        if (tokenAfterLockAquisition !== tokenBeforeLockAquisition) {
          logVerbose(`returning synced token, is null: ${tokenAfterLockAquisition === null}`);
          return tokenAfterLockAquisition;
        }
        const refreshToken = await storageGet(REFRESH_TOKEN_STORAGE_KEY) ?? null;
        if (refreshToken !== null) {
          setIsRefreshingToken(true);
          await verifyCodeAndSetToken({ refreshToken }).finally(() => {
            setIsRefreshingToken(false);
          });
          logVerbose(`returning retrieved token, is null: ${tokenAfterLockAquisition === null}`);
          return token.current;
        } else {
          setIsRefreshingToken(false);
          logVerbose(`returning null, there is no refresh token`);
          return null;
        }
      });
    }
    return token.current;
  }, [verifyCodeAndSetToken, signOut, storageGet]);
  const signingInWithCodeFromURL = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(
    () => {
      var _a;
      if (storage === void 0) {
        throw new Error("`localStorage` is not available in this environment, set the `storage` prop on `ConvexAuthProvider`!");
      }
      const readStateFromStorage = async () => {
        const token2 = await storageGet(JWT_STORAGE_KEY) ?? null;
        logVerbose(`retrieved token from storage, is null: ${token2 === null}`);
        await setToken({
          shouldStore: false,
          tokens: token2 === null ? null : { token: token2 }
        });
      };
      if (serverState !== void 0) {
        const timeFetched = storageGet(SERVER_STATE_FETCH_TIME_STORAGE_KEY);
        const setTokensFromServerState = (timeFetched2) => {
          if (!timeFetched2 || serverState._timeFetched > +timeFetched2) {
            const { token: token2, refreshToken } = serverState._state;
            const tokens = token2 === null || refreshToken === null ? null : { token: token2, refreshToken };
            void storageSet(SERVER_STATE_FETCH_TIME_STORAGE_KEY, serverState._timeFetched.toString());
            void setToken({ tokens, shouldStore: true });
          } else {
            void readStateFromStorage();
          }
        };
        if (timeFetched instanceof Promise) {
          void timeFetched.then(setTokensFromServerState);
        } else {
          setTokensFromServerState(timeFetched);
        }
        return;
      }
      const code = typeof ((_a = window == null ? void 0 : window.location) == null ? void 0 : _a.search) !== "undefined" ? new URLSearchParams(window.location.search).get("code") : null;
      if (signingInWithCodeFromURL.current) {
      } else if (code && (shouldHandleCode === void 0 || (typeof shouldHandleCode === "function" ? shouldHandleCode() : shouldHandleCode))) {
        signingInWithCodeFromURL.current = true;
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        void (async () => {
          await replaceURL(url.pathname + url.search + url.hash);
          await signIn(void 0, { code });
          signingInWithCodeFromURL.current = false;
        })();
      } else {
        void readStateFromStorage();
      }
    },
    // Explicitly chosen dependencies.
    // This effect should mostly only run once
    // on mount.
    [client, storageGet]
  );
  const actions = (0, import_react.useMemo)(() => ({ signIn, signOut }), [signIn, signOut]);
  const isAuthenticated = tokenState !== null;
  const authState = (0, import_react.useMemo)(() => ({
    isLoading,
    isAuthenticated,
    fetchAccessToken
  }), [fetchAccessToken, isLoading, isAuthenticated]);
  return (0, import_jsx_runtime.jsx)(ConvexAuthInternalContext.Provider, { value: authState, children: (0, import_jsx_runtime.jsx)(ConvexAuthActionsContext.Provider, { value: actions, children: (0, import_jsx_runtime.jsx)(ConvexAuthTokenContext.Provider, { value: tokenState, children }) }) });
}
function useNamespacedStorage(peristentStorage, namespace) {
  const inMemoryStorage = useInMemoryStorage();
  const storage = (0, import_react.useMemo)(() => peristentStorage ?? inMemoryStorage(), [peristentStorage]);
  const escapedNamespace = namespace.replace(/[^a-zA-Z0-9]/g, "");
  const storageKey = (0, import_react.useCallback)((key) => `${key}_${escapedNamespace}`, [namespace]);
  const storageSet = (0, import_react.useCallback)((key, value) => storage.setItem(storageKey(key), value), [storage, storageKey]);
  const storageGet = (0, import_react.useCallback)((key) => storage.getItem(storageKey(key)), [storage, storageKey]);
  const storageRemove = (0, import_react.useCallback)((key) => storage.removeItem(storageKey(key)), [storage, storageKey]);
  return { storageSet, storageGet, storageRemove, storageKey };
}
function useInMemoryStorage() {
  const [inMemoryStorage, setInMemoryStorage] = (0, import_react.useState)({});
  return () => ({
    getItem: (key) => inMemoryStorage[key],
    setItem: (key, value) => {
      setInMemoryStorage((prev) => ({ ...prev, [key]: value }));
    },
    removeItem: (key) => {
      setInMemoryStorage((prev) => {
        const { [key]: _, ...rest } = prev;
        return rest;
      });
    }
  });
}
async function browserMutex(key, callback) {
  var _a;
  const lockManager = (_a = window == null ? void 0 : window.navigator) == null ? void 0 : _a.locks;
  return lockManager !== void 0 ? await lockManager.request(key, callback) : await manualMutex(key, callback);
}
function getMutexValue(key) {
  if (globalThis.__convexAuthMutexes === void 0) {
    globalThis.__convexAuthMutexes = {};
  }
  let mutex = globalThis.__convexAuthMutexes[key];
  if (mutex === void 0) {
    globalThis.__convexAuthMutexes[key] = {
      currentlyRunning: null,
      waiting: []
    };
  }
  mutex = globalThis.__convexAuthMutexes[key];
  return mutex;
}
function setMutexValue(key, value) {
  globalThis.__convexAuthMutexes[key] = value;
}
async function enqueueCallbackForMutex(key, callback) {
  const mutex = getMutexValue(key);
  if (mutex.currentlyRunning === null) {
    setMutexValue(key, {
      currentlyRunning: callback().finally(() => {
        const nextCb = getMutexValue(key).waiting.shift();
        getMutexValue(key).currentlyRunning = null;
        setMutexValue(key, {
          ...getMutexValue(key),
          currentlyRunning: nextCb === void 0 ? null : enqueueCallbackForMutex(key, nextCb)
        });
      }),
      waiting: []
    });
  } else {
    setMutexValue(key, {
      ...mutex,
      waiting: [...mutex.waiting, callback]
    });
  }
}
async function manualMutex(key, callback) {
  const outerPromise = new Promise((resolve, reject) => {
    const wrappedCallback = () => {
      return callback().then((v) => resolve(v)).catch((e) => reject(e));
    };
    void enqueueCallbackForMutex(key, wrappedCallback);
  });
  return outerPromise;
}
function browserAddEventListener(type, listener, options) {
  var _a;
  if (typeof window === "undefined")
    return;
  (_a = window.addEventListener) == null ? void 0 : _a.call(window, type, listener, options);
}
function browserRemoveEventListener(type, listener, options) {
  var _a;
  if (typeof window === "undefined")
    return;
  (_a = window.removeEventListener) == null ? void 0 : _a.call(window, type, listener, options);
}

// node_modules/@convex-dev/auth/dist/react/index.js
function useAuthActions() {
  return (0, import_react3.useContext)(ConvexAuthActionsContext);
}
function ConvexAuthProvider(props) {
  const { client, storage, storageNamespace, replaceURL, shouldHandleCode, children } = props;
  const authClient = (0, import_react3.useMemo)(() => {
    var _a;
    return {
      authenticatedCall(action, args) {
        return client.action(action, args);
      },
      unauthenticatedCall(action, args) {
        return new ConvexHttpClient(client.address, {
          logger: client.logger
        }).action(action, args);
      },
      verbose: (_a = client.options) == null ? void 0 : _a.verbose,
      logger: client.logger
    };
  }, [client]);
  return (0, import_jsx_runtime2.jsx)(AuthProvider, { client: authClient, storage: storage ?? // Handle SSR, RN, Web, etc.
  // Pretend we always have storage, the component checks
  // it in first useEffect.
  (typeof window === "undefined" ? void 0 : window == null ? void 0 : window.localStorage), storageNamespace: storageNamespace ?? client.address, replaceURL: replaceURL ?? ((url) => {
    window.history.replaceState({}, "", url);
  }), shouldHandleCode, children: (0, import_jsx_runtime2.jsx)(ConvexProviderWithAuth, { client, useAuth, children }) });
}
function useAuthToken() {
  return (0, import_react3.useContext)(ConvexAuthTokenContext);
}
export {
  ConvexAuthProvider,
  useAuthActions,
  useAuthToken,
  useAuth as useConvexAuth
};
/*! Bundled license information:

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
//# sourceMappingURL=@convex-dev_auth_react.js.map

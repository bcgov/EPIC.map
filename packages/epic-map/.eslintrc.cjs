const NO_BUILD_TIME_ENV =
  "Do not read import.meta.env in @bcgov/epic-map. This is a published artifact: " +
  "build-time environment would be baked in at publish and inherited by every host. " +
  "Take the value as a prop instead.";

const NO_AMBIENT_CREDENTIALS =
  "Do not read credentials from browser storage. The host owns the session and the " +
  "only way a token enters this widget is the getAccessToken prop.";

const NO_AUTH_LIBRARY =
  "The widget does no authentication. The host already has a session and passes a " +
  "token through getAccessToken; adding an auth client here would give the widget a " +
  "second opinion about who the user is and tie every host to our IdP wiring.";

const NO_ROUTER =
  "The widget must not assume a routing context. map-web uses TanStack Router; hosts " +
  "may use anything or nothing. Take navigation targets as props or callbacks.";

const NO_THEME_IMPORT =
  "Do not import epic.theme. Colours come from the host's MUI ThemeProvider via " +
  "context — read them with useTheme() so the widget inherits host styling.";

module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  rules: {
    "no-console": "error",

    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "keycloak-js", message: NO_AUTH_LIBRARY },
          { name: "react-oidc-context", message: NO_AUTH_LIBRARY },
          { name: "oidc-client-ts", message: NO_AUTH_LIBRARY },
          { name: "@tanstack/react-router", message: NO_ROUTER },
          { name: "epic.theme", message: NO_THEME_IMPORT },
        ],
        patterns: [
          { group: ["@tanstack/react-router/*"], message: NO_ROUTER },
          { group: ["epic.theme/*"], message: NO_THEME_IMPORT },
        ],
      },
    ],

    "no-restricted-globals": [
      "error",
      { name: "localStorage", message: NO_AMBIENT_CREDENTIALS },
      { name: "sessionStorage", message: NO_AMBIENT_CREDENTIALS },
    ],

    "no-restricted-syntax": [
      "error",
      {
        // import.meta.env / import.meta.env.VITE_FOO
        selector:
          'MemberExpression[object.type="MetaProperty"][property.name="env"]',
        message: NO_BUILD_TIME_ENV,
      },
      {
        // import.meta["env"]
        selector:
          'MemberExpression[object.type="MetaProperty"][property.value="env"]',
        message: NO_BUILD_TIME_ENV,
      },
      {
        // window.localStorage / window.sessionStorage
        selector:
          'MemberExpression[object.name="window"][property.name=/^(localStorage|sessionStorage)$/]',
        message: NO_AMBIENT_CREDENTIALS,
      },
      {
        // document.cookie
        selector:
          'MemberExpression[object.name="document"][property.name="cookie"]',
        message: NO_AMBIENT_CREDENTIALS,
      },
      {
        // Any ThemeProvider element — the widget inherits the host's theme.
        selector: 'JSXOpeningElement[name.name=/ThemeProvider$/]',
        message: NO_THEME_IMPORT,
      },
    ],
  },
};

const SECRET_ENV_KEYS = ["NVD_API_KEY", "GEMINI_API_KEY", "GITHUB_TOKEN"] as const;

function currentSecrets(): string[] {
  return SECRET_ENV_KEYS.map((key) => process.env[key]).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

export function maskSecrets(text: string, secrets: readonly string[] = currentSecrets()): string {
  return secrets.reduce((masked, secret) => masked.split(secret).join("***"), text);
}

function write(level: "INFO" | "WARN" | "ERROR", message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${maskSecrets(message)}`;
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string): void {
    write("INFO", message);
  },
  warn(message: string): void {
    write("WARN", message);
  },
  error(message: string): void {
    write("ERROR", message);
  },
};

export function defaultInstallDir(): string {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ??
      (process.env.USERPROFILE ? `${process.env.USERPROFILE}\\AppData\\Local` : undefined);
    if (!base) throw new Error("Windows 上找不到 LOCALAPPDATA");
    return `${base}\\oneself`;
  }
  const base = process.env.XDG_DATA_HOME ?? `${process.env.HOME}/.local/share`;
  return `${base}/oneself`;
}

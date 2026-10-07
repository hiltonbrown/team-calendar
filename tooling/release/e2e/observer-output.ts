export function redirectObserverDiagnostics(): void {
  // JSON observations own stdout; diagnostic logging remains on stderr.
  console.info = console.error.bind(console);
  console.debug = console.error.bind(console);
}

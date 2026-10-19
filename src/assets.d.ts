// Vite turns '?url' imports into the URL of the emitted file.
declare module '*?url' {
  const url: string;
  export default url;
}

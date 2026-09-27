declare module 'javascript-lp-solver' {
  const solver: {
    Solve: (model: any) => any;
    [key: string]: any;
  };
  export default solver;
}

declare module 'highs' {
  const highs: any;
  export default highs;
}

module.exports = {
  presets: [['@babel/preset-env', {targets: {node: 'current'}}]],
  plugins: [
    ['@babel/plugin-transform-typescript', {isTSX: true, allExtensions: true}],
    ['@babel/plugin-transform-react-jsx', {runtime: 'automatic'}],
  ],
};

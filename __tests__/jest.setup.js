jest.mock('react-markdown', () => {
  const React = require('react');
  return ({children}) => React.createElement(React.Fragment, null, children);
});
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}) => {
    const React = require('react');
    return React.createElement('pre', null, children);
  },
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

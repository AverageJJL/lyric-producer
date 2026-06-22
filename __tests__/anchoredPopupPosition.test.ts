import {anchoredPopupPosition} from '../src/ui/anchoredPopupPosition';

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {configurable: true, value: width});
  Object.defineProperty(window, 'innerHeight', {configurable: true, value: height});
}

describe('anchoredPopupPosition', () => {
  beforeEach(() => {
    setViewport(1000, 700);
  });

  it('keeps fixed popups out of a right overlay inset', () => {
    const position = anchoredPopupPosition(860, 120, 220, 240, {rightInset: 320});

    expect(position.left + 220).toBeLessThanOrEqual(1000 - 320 - 8);
    expect(position.left).toBe(452);
  });

  it('keeps the legacy numeric gap argument working', () => {
    const position = anchoredPopupPosition(20, 100, 120, 120, 24);

    expect(position).toMatchObject({left: 20, top: 124});
  });
});

import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';

import {GuidanceOverlay} from '../src/web/components/GuidanceOverlay';

describe('GuidanceOverlay', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 0);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    cleanup();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('remeasures after the initial animation frame when the page scrolls', async () => {
    let top = 120;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.getAttribute('data-guide-target') === 'add-track-button') {
        return {x: 10, y: top, left: 10, top, right: 130, bottom: top + 30, width: 120, height: 30, toJSON: () => ({})};
      }
      return originalGetBoundingClientRect.call(this);
    };

    render(
      <>
        <button type="button" data-guide-target="add-track-button">Add</button>
        <GuidanceOverlay targetId="add-track-button" />
      </>,
    );

    const overlay = await screen.findByLabelText('Guided target: + Add track');
    await waitFor(() => expect(overlay).toHaveStyle({top: '120px'}));

    top = 260;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => expect(overlay).toHaveStyle({top: '260px'}));
  });
});

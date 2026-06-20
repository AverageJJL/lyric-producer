import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';

import {SongOnboardingPage} from '../src/web/components/SongOnboardingPage';

describe('SongOnboardingPage home', () => {
  it('renders recent projects and start actions in the choice view', () => {
    const openProject = jest.fn(async () => undefined);
    const openRecentProject = jest.fn(async () => undefined);

    render(
      <SongOnboardingPage
        projectFiles={{
          isBusy: false,
          recentProjects: ['/tmp/session.apc', '/tmp/export.dawproject', '/tmp/album.APC'],
          openProject,
          openRecentProject,
        }}
        onOpenEmptyProject={jest.fn()}
        onOpenSongIdeaProject={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', {name: 'Create a masterpiece.'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Recent'})).toBeInTheDocument();
    const begin = screen.getByRole('region', {name: 'Begin'});
    expect(within(begin).getByRole('button', {name: /Empty project/i})).toBeInTheDocument();
    expect(within(begin).getByRole('button', {name: /I have an idea already/i})).toBeInTheDocument();
    expect(screen.getByText('session.apc')).toBeInTheDocument();
    expect(screen.getByText('album.APC')).toBeInTheDocument();
    expect(screen.queryByText('export.dawproject')).not.toBeInTheDocument();
    expect(
      screen.getByText('session.apc').compareDocumentPosition(screen.getByRole('button', {name: 'Open existing project'})),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(screen.getByRole('button', {name: 'Open existing project'}));
    fireEvent.click(screen.getByRole('button', {name: /session\.apc/i}));

    expect(openProject).toHaveBeenCalledTimes(1);
    expect(openRecentProject).toHaveBeenCalledWith('/tmp/session.apc');
  });

  it('shows an empty recent state when no valid apc projects exist', () => {
    render(
      <SongOnboardingPage
        projectFiles={{
          isBusy: false,
          recentProjects: ['/tmp/export.dawproject'],
          openProject: jest.fn(),
          openRecentProject: jest.fn(),
        }}
        onOpenEmptyProject={jest.fn()}
        onOpenSongIdeaProject={jest.fn()}
      />,
    );

    expect(screen.getByText('No recent projects yet.')).toBeInTheDocument();
  });
});

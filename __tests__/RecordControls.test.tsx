import React from 'react';
import {render, screen} from '@testing-library/react';

import {RecordControls} from '../src/web/components/RecordControls';

describe('RecordControls', () => {
  it('shows lead-in status without rendering recording preferences', () => {
    render(
      <RecordControls
        leadInLabel="Count-in · 4 beats"
        recordingLabel={undefined}
        errorMessage={null}
      />,
    );

    expect(screen.getByText('Count-in · 4 beats')).toBeInTheDocument();
    expect(screen.queryByLabelText('Recording count-in')).not.toBeInTheDocument();
    expect(screen.queryByText('Armed: Vocal')).not.toBeInTheDocument();
  });

  it('stays hidden when there is no live status or error', () => {
    const {container} = render(
      <RecordControls
        leadInLabel={undefined}
        recordingLabel={undefined}
        errorMessage={null}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

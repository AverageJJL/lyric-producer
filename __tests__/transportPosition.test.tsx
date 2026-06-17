import {formatTransportPosition} from '../src/web/components/TransportPosition';

describe('formatTransportPosition', () => {
  it('formats bar and beat from a zero-based playhead beat', () => {
    expect(formatTransportPosition(0, {numerator: 4, denominator: 4}))
      .toEqual({barLabel: '001', beatLabel: '1'});
    expect(formatTransportPosition(3, {numerator: 4, denominator: 4}))
      .toEqual({barLabel: '001', beatLabel: '4'});
    expect(formatTransportPosition(4, {numerator: 4, denominator: 4}))
      .toEqual({barLabel: '002', beatLabel: '1'});
  });

  it('uses the time signature denominator when formatting bar position', () => {
    expect(formatTransportPosition(3, {numerator: 3, denominator: 4}))
      .toEqual({barLabel: '002', beatLabel: '1'});
    expect(formatTransportPosition(3, {numerator: 7, denominator: 8}))
      .toEqual({barLabel: '001', beatLabel: '7'});
    expect(formatTransportPosition(3.5, {numerator: 7, denominator: 8}))
      .toEqual({barLabel: '002', beatLabel: '1'});
  });

  it('clamps negative and fractional positions to the current whole beat', () => {
    expect(formatTransportPosition(-1, {numerator: 4, denominator: 4}))
      .toEqual({barLabel: '001', beatLabel: '1'});
    expect(formatTransportPosition(4.9, {numerator: 4, denominator: 4}))
      .toEqual({barLabel: '002', beatLabel: '1'});
  });
});

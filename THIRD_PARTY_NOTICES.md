# Third-Party Notices

## Airwindows DSP (MIT)

MusicApp embeds a pinned subset of [airwin2rack](https://github.com/baconpaul/airwin2rack)
(`6448ef21972843b741a97f4ddaff5fcc8ab8926d`), which consolidates Airwindows effect sources.

- Original Airwindows effects: Copyright (c) Airwindows — MIT License
- airwin2rack consolidation: Copyright contributors — MIT License

Only the MIT-licensed consolidated DSP sources are compiled (`Parametric`, `Logical4`,
`MatrixVerb`, and shared base). JUCE/VCV Rack plugin targets from airwin2rack are **not**
built or linked.

See `shared_cpp/cmake/MusicAppAirwindows.cmake` for the pinned commit and build guards.

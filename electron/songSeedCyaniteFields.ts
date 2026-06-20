const GENRE_FIELDS = [
  'afro', 'ambient', 'arab', 'asian', 'blues', 'childrenJingle', 'classical',
  'electronicDance', 'folkCountry', 'funkSoul', 'indian', 'jazz', 'latin',
  'metal', 'pop', 'rapHipHop', 'reggae', 'rnb', 'rock', 'singerSongwriters',
  'sound', 'soundtrack', 'spokenWord',
].join(' ');

const SUBGENRE_FIELDS = [
  'bluesRock', 'folkRock', 'hardRock', 'indieAlternative',
  'psychedelicProgressiveRock', 'punk', 'rockAndRoll', 'popSoftRock',
  'abstractIDMLeftfield', 'breakbeatDnB', 'deepHouse', 'electro', 'house',
  'minimal', 'synthPop', 'techHouse', 'techno', 'trance', 'contemporaryRnB',
  'gangsta', 'jazzyHipHop', 'popRap', 'trap', 'blackMetal', 'deathMetal',
  'doomMetal', 'heavyMetal', 'metalcore', 'nuMetal', 'disco', 'funk', 'gospel',
  'neoSoul', 'soul', 'bigBandSwing', 'bebop', 'contemporaryJazz',
  'easyListening', 'fusion', 'latinJazz', 'smoothJazz', 'country', 'folk',
].join(' ');

const INSTRUMENT_FIELDS = [
  'percussion', 'synth', 'piano', 'acousticGuitar', 'electricGuitar', 'strings',
  'bass', 'bassGuitar', 'woodwinds', 'brass',
].join(' ');

const EXTENDED_INSTRUMENT_FIELDS = [
  'acousticGuitar', 'bass', 'bassGuitar', 'electricGuitar', 'percussion', 'piano',
  'synth', 'strings', 'brass', 'woodwinds', 'tuba', 'frenchHorn', 'oboe',
  'mandolin', 'cello', 'marimba', 'vibraphone', 'electricPiano',
  'electricOrgan', 'harp', 'ukulele', 'harpsichord', 'churchOrgan',
  'doubleBass', 'xylophone', 'glockenspiel', 'electronicDrums', 'drumKit',
  'accordion', 'violin', 'flute', 'sax', 'trumpet', 'celeste', 'pizzicato',
  'banjo', 'clarinet', 'bells', 'steelDrums', 'bongoConga', 'africanPercussion',
  'tabla', 'sitar', 'taiko', 'asianFlute', 'asianStrings', 'luteOud',
].join(' ');

const VOICE_FIELDS = 'female instrumental male';
const MOOD_FIELDS = 'aggressive calm chilled dark energetic epic happy romantic sad scary sexy ethereal uplifting';

export const CYANITE_ANALYSIS_FIELDS = `
  __typename
  ... on AudioAnalysisV7Finished {
    result {
      bpmRangeAdjusted timeSignature transformerCaption valence arousal freeGenreTags
      energyLevel energyDynamics emotionalProfile emotionalDynamics
      voicePresenceProfile voiceoverDegree voiceoverExists predominantVoiceGender
      moodTags moodAdvancedTags movementTags characterTags genreTags subgenreTags voiceTags
      advancedGenreTags advancedSubgenreTags instrumentTags advancedInstrumentTags advancedInstrumentTagsExtended
      keyPrediction { value }
      mood { ${MOOD_FIELDS} }
      advancedGenre { ${GENRE_FIELDS} }
      advancedSubgenre { ${SUBGENRE_FIELDS} }
      advancedInstrumentPresence { ${INSTRUMENT_FIELDS} }
      advancedInstrumentPresenceExtended { ${EXTENDED_INSTRUMENT_FIELDS} }
      voice { ${VOICE_FIELDS} }
      segments {
        representativeSegmentIndex timestamps valence arousal
        mood { ${MOOD_FIELDS} }
        advancedGenre { ${GENRE_FIELDS} }
        advancedSubgenre { ${SUBGENRE_FIELDS} }
        advancedInstruments { ${INSTRUMENT_FIELDS} }
        advancedInstrumentsExtended { ${EXTENDED_INSTRUMENT_FIELDS} }
        voice { ${VOICE_FIELDS} }
      }
    }
  }
  ... on AudioAnalysisV7Failed { error { message } }
`;

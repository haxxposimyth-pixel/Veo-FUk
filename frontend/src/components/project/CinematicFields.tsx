import React from 'react';
import Select from '../ui/Select';

export const MOVIE_GENRES = [
  { value: 'Sci-fi', label: 'Sci-fi' },
  { value: 'Ancient Empire', label: 'Ancient Empire' },
  { value: 'Fantasy War', label: 'Fantasy War' },
  { value: 'Monster/Giant Beast', label: 'Monster / Giant Beast' },
  { value: 'Alien Planet', label: 'Alien Planet' },
  { value: 'Post-apocalyptic', label: 'Post-apocalyptic' },
  { value: 'Mythic Action', label: 'Mythic Action' },
  { value: 'Custom', label: 'Custom Genre...' },
];

export const MOVIE_FORMATS = [
  { value: 'single_movie', label: 'Single Movie' },
  { value: 'episode_series', label: 'Episode Series' },
  { value: 'season_based_series', label: 'Season-based Series' },
];

export const MOVIE_DURATIONS = [
  { value: '10', label: '10 minutes' },
  { value: '12', label: '12 minutes' },
  { value: '15', label: '15 minutes' },
];

export const MOVIE_VISUAL_STYLES = [
  { value: 'Cinematic realism', label: 'Cinematic realism' },
  { value: 'Sci-fi noir', label: 'Sci-fi noir' },
  { value: 'Dark fantasy', label: 'Dark fantasy' },
  { value: 'Ancient epic', label: 'Ancient epic' },
  { value: '3D animated', label: '3D animated' },
  { value: 'Anime-inspired', label: 'Anime-inspired' },
  { value: 'Custom', label: 'Custom Style...' },
];

interface CinematicFieldsProps {
  movieGenre: string;
  setMovieGenre: (val: string) => void;
  customMovieGenre: string;
  setCustomMovieGenre: (val: string) => void;
  movieFormat: string;
  setMovieFormat: (val: any) => void;
  movieDuration: number;
  setMovieDuration: (val: number) => void;
  movieVisualStyle: string;
  setMovieVisualStyle: (val: string) => void;
  customMovieVisualStyle: string;
  setCustomMovieVisualStyle: (val: string) => void;
  seasonNumber?: number;
  setSeasonNumber?: (val: number) => void;
  episodeNumber?: number;
  setEpisodeNumber?: (val: number) => void;
}

export const CinematicConfigurationFields: React.FC<CinematicFieldsProps> = ({
  movieGenre,
  setMovieGenre,
  customMovieGenre,
  setCustomMovieGenre,
  movieFormat,
  setMovieFormat,
  movieDuration,
  setMovieDuration,
  movieVisualStyle,
  setMovieVisualStyle,
  customMovieVisualStyle,
  setCustomMovieVisualStyle,
  seasonNumber,
  setSeasonNumber,
  episodeNumber,
  setEpisodeNumber,
}) => {
  const showSeasonEpisode = (movieFormat === 'episode_series' || movieFormat === 'season_based_series') && (setSeasonNumber && setEpisodeNumber);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Movie Genre"
          options={MOVIE_GENRES}
          value={movieGenre}
          onChange={(e) => setMovieGenre(e.target.value)}
        />
        <Select
          label="Movie Format"
          options={MOVIE_FORMATS}
          value={movieFormat}
          onChange={(e) => setMovieFormat(e.target.value as any)}
        />
      </div>

      {movieGenre === 'Custom' && (
        <div className="animate-fade-in space-y-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
            Custom Genre Name
          </label>
          <input
            type="text"
            placeholder="e.g. Cyberpunk Romance, Cosmic Horror"
            value={customMovieGenre}
            onChange={(e) => setCustomMovieGenre(e.target.value)}
            className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
            required
          />
        </div>
      )}

      {showSeasonEpisode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              Season Number
            </label>
            <input
              type="number"
              min="1"
              value={seasonNumber ?? 1}
              onChange={(e) => setSeasonNumber!(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              Episode Number
            </label>
            <input
              type="number"
              min="1"
              value={episodeNumber ?? 1}
              onChange={(e) => setEpisodeNumber!(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
              required
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Episode Duration"
          options={MOVIE_DURATIONS}
          value={String(movieDuration)}
          onChange={(e) => setMovieDuration(parseInt(e.target.value, 10))}
        />
        <Select
          label="Visual Style"
          options={MOVIE_VISUAL_STYLES}
          value={movieVisualStyle}
          onChange={(e) => setMovieVisualStyle(e.target.value)}
        />
      </div>

      {movieVisualStyle === 'Custom' && (
        <div className="animate-fade-in space-y-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
            Custom Visual Style Description
          </label>
          <input
            type="text"
            placeholder="e.g. 1970s polaroid fantasy film, gothic architectural backdrop"
            value={customMovieVisualStyle}
            onChange={(e) => setCustomMovieVisualStyle(e.target.value)}
            className="w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600"
            required
          />
        </div>
      )}
    </div>
  );
};

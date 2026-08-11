import { parseFile } from 'music-metadata';

/**
 * @param {number} totalSeconds
 * @returns {string} HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error('duration seconds must be a non-negative number');
  }
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function probeDuration(filePath) {
  const metadata = await parseFile(filePath);
  const seconds = metadata.format.duration;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('could not read duration from audio file');
  }
  return formatDuration(seconds);
}

import ffmpegStatic from 'ffmpeg-static';

export function getFfmpegCommands(): string[] {
    return [
        process.env.FFMPEG_PATH ?? (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        ...(typeof ffmpegStatic === 'string' ? [ffmpegStatic] : [])
    ];
}

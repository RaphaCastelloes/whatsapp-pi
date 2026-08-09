export interface AudioTranscriber {
    transcribe(inputPath: string): Promise<string>;
}

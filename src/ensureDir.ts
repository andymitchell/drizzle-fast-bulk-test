import { promises as fs } from 'fs';

/**
 * Ensures that the directory at the specified path exists.
 * If the directory structure does not exist, it is created.
 *
 * @param path - The directory path to ensure.
 * @returns A promise that resolves when the directory exists or is created.
 */
export async function ensureDir(path: string): Promise<void> {
    try {
        await fs.mkdir(path, { recursive: true });
    } catch (error) {
        // If the error is not about the directory already existing, rethrow it
        if (error instanceof Error && (error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error;
        }
    }
}
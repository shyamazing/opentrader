// filepath: /c:/Users/Michael/Private/Projects/opentrader/packages/daemon/__tests__/daemon.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Daemon } from '../src/index';
import { createServer, CreateServerOptions } from '../src/server';
import { bootstrapPlatform } from '../src/platform';
import { Platform } from '@opentrader/bot';

vi.mock('../src/server');
vi.mock('../src/platform');
vi.mock('@opentrader/logger');

const mockCreateServer = vi.mocked(createServer);
const mockBootstrapPlatform = vi.mocked(bootstrapPlatform);

describe('Daemon', () => {
    let platform: Platform;
    let server: ReturnType<typeof createServer>;

    beforeEach(async () => {
        platform = {
            shutdown: vi.fn(),
        } as unknown as Platform;
        server = {
            app: {} as any,
            server: {} as any,
            listen: vi.fn(),
            close: vi.fn(),
        };

        mockCreateServer.mockReturnValue(server);
        mockBootstrapPlatform.mockResolvedValue(platform);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should create a new Daemon instance', async () => {
        const params: CreateServerOptions = {
            frontendDistPath: '../frontend/dist',
            port: 4000,
        };

        const daemon = await Daemon.create({ server: params });

        expect(mockBootstrapPlatform).toHaveBeenCalled();
        expect(mockCreateServer).toHaveBeenCalledWith(params);
        expect(server.listen).toHaveBeenCalled();
        expect(daemon).toBeInstanceOf(Daemon);
    });

    it('should shut down the Daemon', async () => {
        const daemon = new Daemon(platform, server);

        await daemon.shutdown();

        expect(server.close).toHaveBeenCalled();
        expect(platform.shutdown).toHaveBeenCalled();
    });

    it('should restart the Daemon', async () => {
        const daemon = new Daemon(platform, server);

        await daemon.restart();

        expect(platform.shutdown).toHaveBeenCalled();
        expect(mockBootstrapPlatform).toHaveBeenCalled();
    });
});
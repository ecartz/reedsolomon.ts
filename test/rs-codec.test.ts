import { describe, it, expect } from 'vitest';
import {
    Generic_GF,
    RS_Encoder,
    RS_Decoder,
    GF_DATA_MATRIX_256,
    GF_QR_CODE_256,
} from '../src/rs-codec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seeded_fill(arr: Int32Array, offset: number, length: number, seed: number): void {
    let state = seed | 0;
    for (let i = offset; i < offset + length; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        arr[i] = (state >>> 16) & 0xff;
    }
}

function clone(arr: Int32Array): Int32Array {
    const out = new Int32Array(arr.length);
    out.set(arr);
    return out;
}

function corrupt_positions(arr: Int32Array, positions: number[], seed: number): void {
    let state = seed | 0;
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const original = arr[pos];
        let value: number;
        do {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            value = (state >>> 16) & 0xff;
        } while (value === original);
        arr[pos] = value;
    }
}

function corrupt_random_n(arr: Int32Array, count: number, seed: number): number[] {
    const positions: number[] = [];
    const used: Record<number, boolean> = {};
    let state = seed | 0;
    while (positions.length < count) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        const pos = (state >>> 16) % arr.length;
        if (!used[pos]) {
            used[pos] = true;
            positions.push(pos);
        }
    }
    corrupt_positions(arr, positions, seed + 9999);
    return positions;
}

function make_encoded_255_223(seed: number): Int32Array {
    const field = GF_DATA_MATRIX_256();
    const encoder = new RS_Encoder(field);
    const msg = new Int32Array(255);
    seeded_fill(msg, 0, 223, seed);
    encoder.encode(msg, 32);
    return msg;
}

function make_encoded_96_64(field: Generic_GF, seed: number): Int32Array {
    const encoder = new RS_Encoder(field);
    const msg = new Int32Array(96);
    seeded_fill(msg, 0, 64, seed);
    encoder.encode(msg, 32);
    return msg;
}

// ---------------------------------------------------------------------------
// Group 1: RS(255, 223) round-trip (no corruption)
// ---------------------------------------------------------------------------

describe('RS(255, 223) round-trip', () => {
    it('should encode-decode round-trip with random data', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);

        const msg = new Int32Array(255);
        seeded_fill(msg, 0, 223, 42);
        const original_data = clone(msg).subarray(0, 223);

        encoder.encode(msg, 32);

        let parity_sum = 0;
        for (let i = 223; i < 255; i++) parity_sum += msg[i];
        expect(parity_sum).toBeGreaterThan(0);

        decoder.decode(msg, 32);

        expect(msg.subarray(0, 223)).toEqual(original_data);
    });

    it('should produce deterministic parity', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);

        const msg1 = new Int32Array(255);
        const msg2 = new Int32Array(255);
        seeded_fill(msg1, 0, 223, 100);
        seeded_fill(msg2, 0, 223, 100);

        encoder.encode(msg1, 32);
        encoder.encode(msg2, 32);

        expect(msg1).toEqual(msg2);
    });
});

// ---------------------------------------------------------------------------
// Group 2: RS(255, 223) single-byte correction
// ---------------------------------------------------------------------------

describe('RS(255, 223) single-byte correction', () => {
    it('should correct error at position 0 (start of data)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(200);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [0], 1);
        expect(corrupted).not.toEqual(original);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct error at position 111 (middle of data)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(200);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [111], 2);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct error at position 222 (end of data)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(200);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [222], 3);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct error at position 230 (in parity region)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(200);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [230], 4);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct error at position 254 (last parity byte)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(200);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [254], 5);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Group 3: RS(255, 223) max correction (16 errors)
// ---------------------------------------------------------------------------

describe('RS(255, 223) max correction', () => {
    it('should correct exactly 16 byte errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(300);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 16, 500);
        expect(corrupted).not.toEqual(original);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct exactly 16 byte errors (second seed)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(777);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 16, 888);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct 15 byte errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(400);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 15, 600);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Group 4: RS(255, 223) beyond capacity
// ---------------------------------------------------------------------------

describe('RS(255, 223) beyond capacity', () => {
    it('should fail with 17 byte errors (throw or mis-decode)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(500);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 17, 700);

        let threw = false;
        let mis_decoded = false;
        try {
            decoder.decode(corrupted, 32);
            if (!arrays_equal(original, corrupted)) {
                mis_decoded = true;
            }
        } catch {
            threw = true;
        }
        expect(threw || mis_decoded).toBe(true);
    });

    it('should fail with 32 byte errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(600);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 32, 800);

        let threw = false;
        try {
            decoder.decode(corrupted, 32);
        } catch {
            threw = true;
        }
        const recovered = arrays_equal(original, corrupted);
        expect(threw || !recovered).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Group 5: RS(96, 64) shortened code (CRITICAL for file header)
// ---------------------------------------------------------------------------

describe('RS(96, 64) shortened code', () => {
    it('should encode-decode round-trip (DATA_MATRIX field)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const msg = make_encoded_96_64(field, 42);
        const original_data = clone(msg).subarray(0, 64);

        let parity_sum = 0;
        for (let i = 64; i < 96; i++) parity_sum += msg[i];
        expect(parity_sum).toBeGreaterThan(0);

        decoder.decode(msg, 32);
        expect(msg.subarray(0, 64)).toEqual(original_data);
    });

    it('should correct single-byte error', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 123);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [30], 10);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct 8 byte errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 456);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 8, 789);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct max 16 byte errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 1000);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 16, 2000);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should fail with 17 errors', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 1100);
        const corrupted = clone(original);
        corrupt_random_n(corrupted, 17, 2200);

        let threw = false;
        let mis_decoded = false;
        try {
            decoder.decode(corrupted, 32);
            if (!arrays_equal(original, corrupted)) {
                mis_decoded = true;
            }
        } catch {
            threw = true;
        }
        expect(threw || mis_decoded).toBe(true);
    });

    it('should correct error at end of shortened data (position 63)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 3000);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [63], 50);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct error in parity region (position 80)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 3000);
        const corrupted = clone(original);
        corrupt_positions(corrupted, [80], 60);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Group 6: Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
    it('should produce all-zero parity for all-zero data', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        encoder.encode(msg, 32);
        for (let i = 223; i < 255; i++) {
            expect(msg[i]).toBe(0);
        }
        decoder.decode(msg, 32);
        for (let i = 0; i < 255; i++) {
            expect(msg[i]).toBe(0);
        }
    });

    it('should round-trip all-255 data', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        for (let i = 0; i < 223; i++) msg[i] = 255;
        const original_data = clone(msg).subarray(0, 223);
        encoder.encode(msg, 32);
        decoder.decode(msg, 32);
        expect(msg.subarray(0, 223)).toEqual(original_data);
    });

    it('should correct single-byte error in all-255 data', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        for (let i = 0; i < 223; i++) msg[i] = 255;
        encoder.encode(msg, 32);
        const original = clone(msg);
        msg[100] = 0;
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should handle RS(33, 1) — single data byte + 32 parity', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(33);
        msg[0] = 42;
        encoder.encode(msg, 32);
        const original = clone(msg);
        msg[0] = 0;
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should handle RS(34, 2) — two data bytes + 32 parity', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(34);
        msg[0] = 200;
        msg[1] = 100;
        encoder.encode(msg, 32);
        const original = clone(msg);
        msg[0] = 0;
        msg[1] = 0;
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should handle RS(255, 1) — maximum parity, 127 error correction', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        msg[0] = 137;
        encoder.encode(msg, 254);
        const original = clone(msg);
        corrupt_random_n(msg, 127, 42);
        decoder.decode(msg, 254);
        expect(msg).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Group 7: Both GF fields
// ---------------------------------------------------------------------------

describe('Both GF fields', () => {
    it('should round-trip with QR_CODE field', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        seeded_fill(msg, 0, 223, 999);
        const original_data = clone(msg).subarray(0, 223);
        encoder.encode(msg, 32);
        decoder.decode(msg, 32);
        expect(msg.subarray(0, 223)).toEqual(original_data);
    });

    it('should correct single-byte error with QR_CODE field', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        seeded_fill(msg, 0, 223, 1234);
        encoder.encode(msg, 32);
        const original = clone(msg);
        msg[50] = (msg[50] + 1) & 0xff;
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should correct 16 errors with QR_CODE field', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        seeded_fill(msg, 0, 223, 5555);
        encoder.encode(msg, 32);
        const original = clone(msg);
        corrupt_random_n(msg, 16, 6666);
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should handle shortened RS(96,64) with QR_CODE field', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(96);
        seeded_fill(msg, 0, 64, 7777);
        encoder.encode(msg, 32);
        const original = clone(msg);
        corrupt_random_n(msg, 16, 8888);
        decoder.decode(msg, 32);
        expect(msg).toEqual(original);
    });

    it('should produce different parity for different GF fields', () => {
        const dm_field = GF_DATA_MATRIX_256();
        const qr_field = GF_QR_CODE_256();
        const dm_encoder = new RS_Encoder(dm_field);
        const qr_encoder = new RS_Encoder(qr_field);

        const msg_dm = new Int32Array(255);
        const msg_qr = new Int32Array(255);
        seeded_fill(msg_dm, 0, 223, 42);
        seeded_fill(msg_qr, 0, 223, 42);

        dm_encoder.encode(msg_dm, 32);
        qr_encoder.encode(msg_qr, 32);

        expect(msg_dm.subarray(0, 223)).toEqual(msg_qr.subarray(0, 223));
        expect(msg_dm.subarray(223)).not.toEqual(msg_qr.subarray(223));
    });
});

// ---------------------------------------------------------------------------
// Group 8: Miscellaneous / robustness
// ---------------------------------------------------------------------------

describe('Miscellaneous', () => {
    it('should throw on zero EC bytes', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const msg = new Int32Array(10);
        expect(() => encoder.encode(msg, 0)).toThrow();
    });

    it('should throw on no data bytes', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const msg = new Int32Array(32);
        expect(() => encoder.encode(msg, 32)).toThrow();
    });

    it('should reuse cached generator across multiple encodes', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const msg1 = new Int32Array(255);
        const msg2 = new Int32Array(255);
        seeded_fill(msg1, 0, 223, 11);
        seeded_fill(msg2, 0, 223, 22);
        encoder.encode(msg1, 32);
        encoder.encode(msg2, 32);
        let sum1 = 0, sum2 = 0;
        for (let i = 223; i < 255; i++) { sum1 += msg1[i]; sum2 += msg2[i]; }
        expect(sum1).toBeGreaterThan(0);
        expect(sum2).toBeGreaterThan(0);
    });

    it('should be idempotent on clean codeword', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);
        const msg = new Int32Array(255);
        seeded_fill(msg, 0, 223, 55);
        encoder.encode(msg, 32);
        const after_first = clone(msg);
        decoder.decode(msg, 32);
        const after_second = clone(msg);
        decoder.decode(msg, 32);
        expect(after_first).toEqual(after_second);
        expect(after_second).toEqual(msg);
    });
});

// ---------------------------------------------------------------------------
// Group 9: Burst error tests
// ---------------------------------------------------------------------------

describe('Burst error correction', () => {
    it('should correct 16 consecutive byte errors in data region', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(1234);
        const corrupted = clone(original);
        const positions = Array.from({ length: 16 }, (_, i) => 50 + i);
        corrupt_positions(corrupted, positions, 42);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct 16 consecutive byte errors starting at position 0', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(2345);
        const corrupted = clone(original);
        const positions = Array.from({ length: 16 }, (_, i) => i);
        corrupt_positions(corrupted, positions, 43);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct 16 consecutive byte errors at end of data', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(3456);
        const corrupted = clone(original);
        const positions = Array.from({ length: 16 }, (_, i) => 207 + i);
        corrupt_positions(corrupted, positions, 44);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct 16 consecutive byte errors spanning data/parity boundary', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_255_223(4567);
        const corrupted = clone(original);
        const positions = Array.from({ length: 16 }, (_, i) => 215 + i);
        corrupt_positions(corrupted, positions, 45);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });

    it('should correct burst of 8 consecutive errors in RS(96,64)', () => {
        const field = GF_DATA_MATRIX_256();
        const decoder = new RS_Decoder(field);
        const original = make_encoded_96_64(field, 5678);
        const corrupted = clone(original);
        const positions = Array.from({ length: 8 }, (_, i) => 20 + i);
        corrupt_positions(corrupted, positions, 46);
        decoder.decode(corrupted, 32);
        expect(corrupted).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Group 10: Stress tests (multiple random seeds at max capacity)
// ---------------------------------------------------------------------------

describe('Stress tests', () => {
    it('should correct 16 errors across 20 different random seeds', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);

        for (let seed = 1; seed <= 20; seed++) {
            const msg = new Int32Array(255);
            seeded_fill(msg, 0, 223, seed * 1000);
            encoder.encode(msg, 32);
            const original = clone(msg);
            corrupt_random_n(msg, 16, seed * 7777);
            decoder.decode(msg, 32);
            expect(msg).toEqual(original);
        }
    });

    it('should correct 16 errors in RS(96,64) across 20 different random seeds', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);

        for (let seed = 1; seed <= 20; seed++) {
            const msg = new Int32Array(96);
            seeded_fill(msg, 0, 64, seed * 2000);
            encoder.encode(msg, 32);
            const original = clone(msg);
            corrupt_random_n(msg, 16, seed * 3333);
            decoder.decode(msg, 32);
            expect(msg).toEqual(original);
        }
    });

    it('should handle varying error counts from 1 to 16', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const decoder = new RS_Decoder(field);

        for (let error_count = 1; error_count <= 16; error_count++) {
            const msg = new Int32Array(255);
            seeded_fill(msg, 0, 223, error_count * 500);
            encoder.encode(msg, 32);
            const original = clone(msg);
            corrupt_random_n(msg, error_count, error_count * 1111);
            decoder.decode(msg, 32);
            expect(msg).toEqual(original);
        }
    });
});

// ---------------------------------------------------------------------------
// Group 11: Known-answer vectors (from original reedsolomon.js / ZXing)
// ---------------------------------------------------------------------------

describe('Known-answer vectors', () => {
    it('should produce correct parity for DataMatrix 3-byte message', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const data = new Int32Array([142, 164, 186]);
        const expected_parity = new Int32Array([114, 25, 5, 88, 102]);
        const msg = new Int32Array(data.length + expected_parity.length);
        msg.set(data);
        encoder.encode(msg, expected_parity.length);
        expect(msg.subarray(data.length)).toEqual(expected_parity);
    });

    it('should produce correct parity for DataMatrix 36-byte message', () => {
        const field = GF_DATA_MATRIX_256();
        const encoder = new RS_Encoder(field);
        const data = new Int32Array([
            0x69, 0x75, 0x75, 0x71, 0x3B, 0x30, 0x30, 0x64,
            0x70, 0x65, 0x66, 0x2F, 0x68, 0x70, 0x70, 0x68,
            0x6D, 0x66, 0x2F, 0x64, 0x70, 0x6E, 0x30, 0x71,
            0x30, 0x7B, 0x79, 0x6A, 0x6F, 0x68, 0x30, 0x81,
            0xF0, 0x88, 0x1F, 0xB5,
        ]);
        const expected_parity = new Int32Array([
            0x1C, 0x64, 0xEE, 0xEB, 0xD0, 0x1D, 0x00, 0x03,
            0xF0, 0x1C, 0xF1, 0xD0, 0x6D, 0x00, 0x98, 0xDA,
            0x80, 0x88, 0xBE, 0xFF, 0xB7, 0xFA, 0xA9, 0x95,
        ]);
        const msg = new Int32Array(data.length + expected_parity.length);
        msg.set(data);
        encoder.encode(msg, expected_parity.length);
        expect(msg.subarray(data.length)).toEqual(expected_parity);
    });

    it('should produce correct parity for QR Code ISO 18004 Annex I vector', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const data = new Int32Array([
            0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11,
            0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11,
        ]);
        const expected_parity = new Int32Array([
            0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87,
            0x2C, 0x55,
        ]);
        const msg = new Int32Array(data.length + expected_parity.length);
        msg.set(data);
        encoder.encode(msg, expected_parity.length);
        expect(msg.subarray(data.length)).toEqual(expected_parity);
    });

    it('should produce correct parity for QR Code 32-byte message', () => {
        const field = GF_QR_CODE_256();
        const encoder = new RS_Encoder(field);
        const data = new Int32Array([
            0x72, 0x67, 0x2F, 0x77, 0x69, 0x6B, 0x69, 0x2F,
            0x4D, 0x61, 0x69, 0x6E, 0x5F, 0x50, 0x61, 0x67,
            0x65, 0x3B, 0x3B, 0x00, 0xEC, 0x11, 0xEC, 0x11,
            0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11,
        ]);
        const expected_parity = new Int32Array([
            0xD8, 0xB8, 0xEF, 0x14, 0xEC, 0xD0, 0xCC, 0x85,
            0x73, 0x40, 0x0B, 0xB5, 0x5A, 0xB8, 0x8B, 0x2E,
            0x08, 0x62,
        ]);
        const msg = new Int32Array(data.length + expected_parity.length);
        msg.set(data);
        encoder.encode(msg, expected_parity.length);
        expect(msg.subarray(data.length)).toEqual(expected_parity);
    });
});

// ---------------------------------------------------------------------------
// Helper used in beyond-capacity tests (not imported, local)
// ---------------------------------------------------------------------------

function arrays_equal(a: Int32Array, b: Int32Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

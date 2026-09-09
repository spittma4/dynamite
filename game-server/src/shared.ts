/**
 * The one file that knows where `shared/` sits relative to the server. Every
 * other module imports from here, so moving the package is a one-line change.
 */
export * from '../../shared/src/index';
export {
    validateLayoutConfig,
    validateLevelConfig,
    validateLevelOnLayout,
} from '../../shared/src/config/validate';
export type { ValidationResult } from '../../shared/src/config/validate';

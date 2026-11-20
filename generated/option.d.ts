declare namespace _default {
    let reference: string;
    let generated_by: string;
    let statuses: {
        code: number;
        name: string;
        message: string;
    }[];
    namespace status_unknown {
        let name: string;
        let message: string;
    }
    let mechanical_floor: number;
    let kinds: string[];
    let sources: string[];
    let source_unknown: string;
    let depth_max: number;
    namespace registry {
        let bindings: number;
        let variables: number;
        let text: number;
        let djins: number;
    }
    let djin_abi: number;
    let djin_statuses: string[];
    let djin_status_unknown: string;
}
export default _default;

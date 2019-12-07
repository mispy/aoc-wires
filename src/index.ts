import * as _ from 'lodash'
import './index.scss'
import { observable, computed, action, autorun } from 'mobx'
const log = console.log

class Point {
    static for(x: number, y: number) {
        return new Point(x, y)
    }

    x: number
    y: number
    constructor(x: number, y: number) {
        this.x = x
        this.y = y
    }

    equals(op: Point) {
        return this.x === op.x && this.y === op.y
    }

    dist(op: Point) {
        return Math.abs(this.x-op.x)+Math.abs(this.y-op.y)
    }
}

interface PixelPoint {
    step: number
    color: string
    rp: Point
}

class Line {
    start: Point
    end: Point
    stepStart: number
    stepEnd: number
    facing: string
    constructor(facing: string, x1: number, y1: number, x2: number, y2: number, stepStart: number, stepEnd: number) {
        this.start = Point.for(x1, y1)
        this.end = Point.for(x2, y2)
        this.stepStart = stepStart
        this.stepEnd = stepEnd
        this.facing = facing
    }

    intersection(ol: Line) {
        const p1 = this.start, p2 = this.end
        const o1 = ol.start, o2 = ol.end
        const x1 = p1.x, y1 = p1.y
        const x2 = p2.x, y2 = p2.y
        const x3 = o1.x, y3 = o1.y
        const x4 = o2.x, y4 = o2.y
    
        // Check if none of the lines are of length 0
        if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) {
            return false
        }

        const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1))

        // Lines are parallel
        if (denominator === 0) {
            return false
        }

        let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator
        let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator

        // is the intersection along the segments
        if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
            return false
        }

        // Return a object with the x and y coordinates of the intersection
        let x = x1 + ua * (x2 - x1)
        let y = y1 + ua * (y2 - y1)

        return Point.for(x, y)
    }    
}

function toLines(wiredef: string): Line[] {
    const moves = wiredef.split(",")
    const lines: Line[] = []
    let x = 0
    let y = 0
    let steps = 0

    for (const move of moves) {
        const facing = move[0]
        const dist = parseInt(move.slice(1))

        if (isNaN(dist))
            continue

        const x1 = x
        const y1 = y

        if (facing === 'R') {
            x += dist
        } else if (facing === 'D') {
            y += dist
        } else if (facing === 'L') {
            x -= dist
        } else if (facing === 'U') {
            y -= dist
        }

        lines.push(new Line(facing, x1, y1, x, y, steps, steps+dist))
        steps += dist
    }

    return lines
}

class Puzzle {
    app: PuzzleApp
    origin: Point = Point.for(0, 0)

    constructor(app: PuzzleApp) {
        this.app = app
    }

    @computed get wires(): Line[][] {
        return this.app.options.puzzleInput.trim().split("\n").map(w => toLines(w))
    }

    @computed get allLines() {
        return _.flatten(this.wires)
    }

    @computed get endpoints() {
        return this.allLines.map(l => l.end)
    }

    @computed get endstep() {
        const endsteps = this.wires.map(w => w.length ? w[w.length-1].stepEnd : null)
        return _.max(endsteps) || 10
    }

    // @computed get size() {
    //     const extents = this.endpoints.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))
    //     return extents.length ? extents[0]+5 : 10
    // }

    @computed get width() {
        const xVals = this.endpoints.map(p => Math.abs(p.x))
        return (_.max(xVals) || 5) * 2
    }

    @computed get height() {
        const yVals = this.endpoints.map(p => Math.abs(p.y))
        return (_.max(yVals) || 5) * 2
    }

    @computed get intersections() {
        if (this.wires.length < 2)
            return []

        const intersections = []
        for (const l1 of this.wires[0]) {
            for (const l2 of this.wires[1]) {
                const int = l1.intersection(l2)
                if (int) {
                    const step1 = l1.stepStart + l1.start.dist(int)
                    const step2 = l2.stepStart + l2.start.dist(int)

                    intersections.push({
                        point: int,
                        step: Math.max(step1, step2),
                        combinedStep: step1+step2
                    })
                }
            }
        }
        return intersections
    }

    @computed get closestIntersection() {
        return _.sortBy(this.intersections, int => int.point.dist(this.origin))[0]
    }

    @computed get fastestIntersection() {
        return _.sortBy(this.intersections, int => int.combinedStep)[0]

    }
}


class PuzzleVisualization {
    app: PuzzleApp
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    @observable canvasWidth: number = 0
    @observable canvasHeight: number = 0
    @observable step: number = 0
    animationHandle: number|null = null
    drawTime: number = 1 * 1000

    constructor(app: PuzzleApp) {
        this.app = app
        this.canvas = document.getElementById("canvas") as HTMLCanvasElement
        this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D
    }

    get puzzle() {
        return this.app.puzzle
    }

    // A unit of movement should occupy the same vertical and horizontal screen space
    @computed get cellPixelSize() {
        return Math.min(this.canvasWidth-20, this.canvasHeight-20) / Math.max(this.puzzle.width, this.puzzle.height)
    }

    @computed get cellPixelWidth() {
        return this.cellPixelSize
    }

    @computed get cellPixelHeight() {
        return this.cellPixelSize
    }

    @action.bound start() {
        window.addEventListener("resize", this.onResize)
        this.onResize()

        autorun(() => this.render())
        this.beginAnimation()
    }

    @action.bound onResize() {
        const width = this.canvas.parentElement!.offsetWidth
        const height = this.canvas.parentElement!.offsetHeight

        this.canvas.style.width = width+'px'
        this.canvas.style.height = height+'px'

        const scale = window.devicePixelRatio

        this.canvas.width = width*scale
        this.canvas.height = height*scale
        this.ctx.scale(scale, scale)

        this.canvasWidth = width
        this.canvasHeight = height
        this.render()
    }

    @action.bound beginAnimation() {
        if (this.animationHandle != null)
            cancelAnimationFrame(this.animationHandle)

        let start: number
        const frame = (timestamp: number) => {
            if (!start) start = timestamp
            const timePassed = timestamp-start
            const fracPassed = Math.min(timePassed / this.drawTime, 1)
            this.step = Math.floor(fracPassed * this.puzzle.endstep) 
            if (fracPassed < 1)
                this.animationHandle = requestAnimationFrame(frame)
        }
        this.animationHandle = requestAnimationFrame(frame)
    }

    toRenderSpace(p: Point) {
        return Point.for(
            Math.round(this.canvasWidth/2 + this.cellPixelWidth * p.x),
            Math.round(this.canvasHeight/2 + this.cellPixelHeight * p.y)
        )
    }

    drawWire(wire: Line[]) {
        for (const line of wire) {
            if (line.stepEnd > this.step) {
                let { x, y } = line.start
                const dist = this.step - line.stepStart

                if (line.facing === 'R') {
                    x += dist
                } else if (line.facing === 'D') {
                    y += dist
                } else if (line.facing === 'L') {
                    x -= dist
                } else if (line.facing === 'U') {
                    y -= dist
                }

                const p = Point.for(x, y)
                const rp = this.toRenderSpace(p)
                this.ctx.lineTo(rp.x, rp.y)
                break
            }

            const rp = this.toRenderSpace(line.end)
            this.ctx.lineTo(rp.x, rp.y)
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        const origin = this.toRenderSpace(this.puzzle.origin)

        for (const wire of this.puzzle.wires) {
            this.ctx.strokeStyle = wire === this.puzzle.wires[0] ? "#31f0bc" : "#ff691c"
            this.ctx.lineWidth = Math.ceil(this.cellPixelSize)*2
            this.ctx.beginPath()
            this.ctx.moveTo(origin.x, origin.y)
            this.drawWire(wire)
            this.ctx.stroke()
        }

        if (this.app.options.showIntersections) {
            for (const int of this.puzzle.intersections) {
                if (int.step > this.step)
                    continue
                const rp = this.toRenderSpace(int.point)
                this.ctx.fillStyle = "#fff51d"
                this.ctx.font = "10px Arial"
                this.ctx.textBaseline = 'middle'
                this.ctx.textAlign = "center"
                this.ctx.fillText("X", rp.x, rp.y)
            }    
        }

        this.ctx.fillStyle = "#ffffff"
        this.ctx.beginPath()
        this.ctx.arc(origin.x, origin.y, Math.ceil(this.cellPixelSize)*2, 0, 2*Math.PI)
        this.ctx.fill()

        if (this.app.options.showSolution1) {
            const { closestIntersection } = this.puzzle
            if (closestIntersection && closestIntersection.step <= this.step) {
                const rp = this.toRenderSpace(closestIntersection.point)

                this.ctx.fillStyle = "#0f0f23"
                this.ctx.beginPath()
                this.ctx.arc(rp.x, rp.y, 6, 0, 2*Math.PI)
                this.ctx.fill()

                this.ctx.lineWidth = 1
                this.ctx.strokeStyle = "#ffff66"
                this.ctx.font = "10px Arial"
                this.ctx.textBaseline = 'middle'
                this.ctx.textAlign = "center"
                this.ctx.strokeText("1", rp.x, rp.y+0.5)
            }
        }

        if (this.app.options.showSolution2) {
            const { fastestIntersection } = this.puzzle
            if (fastestIntersection && fastestIntersection.step <= this.step) {
                const rp = this.toRenderSpace(fastestIntersection.point)

                this.ctx.lineWidth = 1
                this.ctx.fillStyle = "#0f0f23"
                this.ctx.beginPath()
                this.ctx.arc(rp.x, rp.y, 6, 0, 2*Math.PI)
                this.ctx.fill()

                this.ctx.strokeStyle = "#ffff66"
                this.ctx.font = "10px Arial"
                this.ctx.textBaseline = 'middle'
                this.ctx.textAlign = "center"
                this.ctx.strokeText("2", rp.x, rp.y+0.5)
            }
        }
    }
}

class PuzzleControls {
    app: PuzzleApp
    constructor(app: PuzzleApp) {
        this.app = app
    }

    start() {
        const { app } = this
        const ui = document.querySelector("#ui") as HTMLDivElement

        const inputArea = ui.querySelector("textarea") as HTMLTextAreaElement
        inputArea.value = INITIAL_INPUT
        inputArea.oninput = () => { app.options.puzzleInput = inputArea.value }

        const runWires = ui.querySelector("#runWires") as HTMLInputElement
        runWires.onclick = () => { app.viz.drawTime = 1 * 1000; app.viz.beginAnimation() }
    
        const runWiresSlowly = ui.querySelector("#runWiresSlowly") as HTMLInputElement
        runWiresSlowly.onclick = () => { app.viz.drawTime = 60 * 1000; app.viz.beginAnimation() }
    
        const showIntersections = ui.querySelector("#showIntersections") as HTMLInputElement
        showIntersections.onchange = () => app.options.showIntersections = showIntersections.checked
        autorun(() => showIntersections.checked = app.options.showIntersections)

        const showSolution1 = ui.querySelector("#showSolution1") as HTMLInputElement
        showSolution1.onchange = () => app.options.showSolution1 = showSolution1.checked
        autorun(() => showSolution1.checked = app.options.showSolution1)

        const showSolution2 = ui.querySelector("#showSolution2") as HTMLInputElement
        showSolution2.onchange = () => app.options.showSolution2 = showSolution2.checked
        autorun(() => showSolution2.checked = app.options.showSolution2)

        const solution1 = document.getElementById("solution1") as HTMLParagraphElement
        const solution2 = document.getElementById("solution2") as HTMLParagraphElement
        const solution1Code = solution1.querySelector("code") as HTMLSpanElement
        const solution2Code = solution2.querySelector("code") as HTMLSpanElement

        const { options, puzzle } = app
        autorun(() => {
            if (options.showSolution1 && puzzle.closestIntersection) {
                solution1.style.display = 'block'
                solution1Code.innerText = puzzle.closestIntersection.point.dist(puzzle.origin).toString()
            } else {
                solution1.style.display = 'none'
            }
        })

        autorun(() => {
            if (options.showSolution2 && puzzle.fastestIntersection) {
                solution2.style.display = 'block'
                solution2Code.innerText = puzzle.fastestIntersection.combinedStep.toString()
            } else {
                solution2.style.display = 'none'
            }
        })
    }
}

type PuzzleOptions = {
    puzzleInput: string
    showIntersections: boolean
    showSolution1: boolean
    showSolution2: boolean
}

class PuzzleApp {
    @observable options: PuzzleOptions = {
        puzzleInput: INITIAL_INPUT,
        showIntersections: true,
        showSolution1: false,
        showSolution2: false
    }

    puzzle: Puzzle = new Puzzle(this)
    viz: PuzzleVisualization = new PuzzleVisualization(this)
    controls: PuzzleControls = new PuzzleControls(this)

    start() {
        this.viz.start()
        this.controls.start()
    }
}

function main() {
    const app = new PuzzleApp()
    ;(window as any).app = app
    ;(window as any).puzzle = app.puzzle
    app.start()
}

const INITIAL_INPUT = `R997,D443,L406,D393,L66,D223,R135,U452,L918,U354,L985,D402,R257,U225,R298,U369,L762,D373,R781,D935,R363,U952,L174,D529,L127,D549,R874,D993,L890,U881,R549,U537,L174,U766,R244,U131,R861,D487,R849,U304,L653,D497,L711,D916,R12,D753,R19,D528,L944,D155,L507,U552,R844,D822,R341,U948,L922,U866,R387,U973,R534,U127,R48,U744,R950,U522,R930,U320,R254,D577,L142,D29,L24,D118,L583,D683,L643,U974,L683,U985,R692,D271,L279,U62,R157,D932,L556,U574,R615,D428,R296,U551,L452,U533,R475,D302,R39,U846,R527,D433,L453,D567,R614,U807,R463,U712,L247,D436,R141,U180,R783,D65,L379,D935,R989,U945,L901,D160,R356,D828,R45,D619,R655,U104,R37,U793,L360,D242,L137,D45,L671,D844,R112,U627,R976,U10,R942,U26,L470,D284,R832,D59,R97,D9,L320,D38,R326,U317,L752,U213,R840,U789,L152,D64,L628,U326,L640,D610,L769,U183,R844,U834,R342,U630,L945,D807,L270,D472,R369,D920,R283,U440,L597,U137,L133,U458,R266,U91,R137,U536,R861,D325,R902,D971,R891,U648,L573,U139,R951,D671,R996,U864,L749,D681,R255,U306,R154,U706,L817,D798,R109,D594,R496,D867,L217,D572,L166,U723,R66,D210,R732,D741,L21,D574,L523,D646,R313,D961,L474,U990,R125,U928,L58,U726,R200,D364,R244,U622,R823,U39,R918,U549,R667,U935,R372,U241,L56,D713,L735,U735,L812,U700,L408,U980,L242,D697,L580,D34,L266,U190,R876,U857,L967,U493,R871,U563,L241,D636,L467,D793,R304,U103,L950,D503,R487,D868,L358,D747,L338,D273,L485,D686,L974,D724,L534,U561,R729,D162,R731,D17,R305,U712,R472,D158,R921,U827,L944,D303,L526,D782,R575,U948,L401,D142,L48,U766,R799,D242,R821,U673,L120
L991,D492,L167,D678,L228,U504,R972,U506,R900,U349,R329,D802,R616,U321,R252,U615,R494,U577,R322,D593,R348,U140,L676,U908,L528,D247,L498,D79,L247,D432,L569,U206,L668,D269,L25,U180,R181,D268,R655,D346,R716,U240,L227,D239,L223,U760,L10,D92,L633,D425,R198,U222,L542,D790,L596,U667,L87,D324,R456,U366,R888,U319,R784,D948,R641,D433,L519,U950,L689,D601,L860,U233,R21,D214,L89,U756,L361,U258,L950,D483,R252,U206,L184,U574,L540,U926,R374,U315,R357,U512,R503,U917,R745,D809,L94,D209,R616,U47,R61,D993,L589,D1,R387,D731,R782,U771,L344,U21,L88,U614,R678,U259,L311,D503,L477,U829,R861,D46,R738,D138,L564,D279,L669,U328,L664,U720,L746,U638,R790,D242,R504,D404,R409,D753,L289,U128,L603,D696,L201,D638,L902,D279,L170,D336,L311,U683,L272,U396,R180,D8,R816,D904,L129,D809,R168,D655,L459,D545,L839,U910,L642,U704,R301,D235,R469,D556,L624,D669,L174,D272,R515,D60,L668,U550,L903,D881,L600,D734,R815,U585,R39,D87,R198,D418,L150,D964,L818,D250,L198,D127,R521,U478,L489,D676,L84,U973,R384,D167,R372,D981,L733,D682,R746,D803,L834,D421,R153,U752,L381,D990,R216,U469,L446,D763,R332,D813,L701,U872,L39,D524,L469,U508,L700,D382,L598,U563,R652,D901,R638,D358,L486,D735,L232,U345,R746,U818,L13,U618,R881,D647,R191,U652,R358,U423,L137,D224,R415,U82,R778,D403,R661,D157,R393,D954,L308,D986,L293,U870,R13,U666,L232,U144,R887,U364,L507,U520,R823,D11,L927,D904,R618,U875,R143,D457,R459,D755,R677,D561,L499,U267,L721,U274,L700,D870,L612,D673,L811,D695,R929,D84,L578,U201,L745,U963,L185,D687,L662,U313,L853,U314,R336`

main()
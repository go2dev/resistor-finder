// Schematic drawing library
class Schematic {
    constructor() {
        // Default styling
        this.styles = {
            stroke: '#000000',
            strokeWidth: 2,
            fill: 'none'
        };
    }

    // Create an SVG element with given dimensions
    createSVG(width, height) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        // Don't set width/height attributes - use viewBox only
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        return svg;
    }

    // Draw a resistor
    drawResistor(x, y, designator = 'R1', value = '100') {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const width = 40;
        const height = 20;
        
        // Create the zigzag pattern
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${x} ${y} 
                  v 5 l -5 5 l 5 5 l -5 5 l 5 5 l -5 5 l 5 5 v 5`;
        
        path.setAttribute('d', d);
        path.setAttribute('stroke', this.styles.stroke);
        path.setAttribute('stroke-width', this.styles.strokeWidth);
        path.setAttribute('fill', this.styles.fill);
        
        // Draw the designator text
        const designatorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        designatorText.setAttribute('x', x + 15);
        designatorText.setAttribute('y', y + 15);
        designatorText.setAttribute('font-size', '12px');
        designatorText.textContent = designator;
        
        // Draw the value text
        const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valueText.setAttribute('x', x + 8);
        valueText.setAttribute('y', y + 20);
        valueText.setAttribute('font-size', '12px');
        valueText.textContent = value;
        
        group.appendChild(path);
        group.appendChild(designatorText);
        group.appendChild(valueText);
        return group;
    }

    // Draw a wire
    drawWire(x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', this.styles.stroke);
        line.setAttribute('stroke-width', this.styles.strokeWidth);
        return line;
    }

    // Draw VCC symbol
    drawVCC(x, y, value) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Draw the triangle
        const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const size = 15;
        const d = `M ${x} ${y - size} L ${x - size} ${y} L ${x + size} ${y} Z`;
        triangle.setAttribute('d', d);
        triangle.setAttribute('stroke', this.styles.stroke);
        triangle.setAttribute('stroke-width', this.styles.strokeWidth);
        triangle.setAttribute('fill', this.styles.fill);
        
        // Draw the Vsupply text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + size + 5);
        text.setAttribute('y', y + 4);
        text.setAttribute('font-size', '12px');
        text.textContent = `Vsupply [${value}V]`;
        
        group.appendChild(triangle);
        group.appendChild(text);
        return group;
    }

    // Draw ground symbol
    drawGround(x, y) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Draw the horizontal lines
        const line1 = this.drawWire(x - 10, y, x + 10, y);
        const line2 = this.drawWire(x - 5, y + 5, x + 5, y + 5);
        const line3 = this.drawWire(x - 2, y + 10, x + 2, y + 10);
        
        group.appendChild(line1);
        group.appendChild(line2);
        group.appendChild(line3);
        return group;
    }

    // Draw a resistor with just a value label
    drawResistorValue(x, y, value, orientation = 'vertical') {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        // Use the utility function for formatting
        const formattedValue = ResistorUtils.formatResistorValue(value);
        
        if (orientation === 'vertical') {
            // Zigzag path (vertical)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x} ${y} v 5 l -5 5 l 5 5 l -5 5 l 5 5 l -5 5 l 5 5 v 5`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', this.styles.stroke);
            path.setAttribute('stroke-width', this.styles.strokeWidth);
            path.setAttribute('fill', this.styles.fill);
            group.appendChild(path);
            // Value label
            const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            valueText.setAttribute('x', x + 5);
            valueText.setAttribute('y', y + 25);
            valueText.setAttribute('font-size', '12px');
            valueText.textContent = formattedValue;
            group.appendChild(valueText);
        } else {
            // Zigzag path (horizontal)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${x} ${y} h 5 l 5 -5 l 5 5 l 5 -5 l 5 5 l 5 -5 l 5 5 h 5`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', this.styles.stroke);
            path.setAttribute('stroke-width', this.styles.strokeWidth);
            path.setAttribute('fill', this.styles.fill);
            group.appendChild(path);
            // Value label
            const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            valueText.setAttribute('x', x + 8);
            valueText.setAttribute('y', y - 5);
            valueText.setAttribute('font-size', '12px');
            valueText.textContent = formattedValue;
            group.appendChild(valueText);
        }
        return group;
    }
}

// Diagram class to manage component layout and connections
class Diagram {
    constructor(containerId, width = 800, height = 600) {
        this.schematic = new Schematic();
        this.svg = this.schematic.createSVG(width, height);
        this.container = document.getElementById(containerId);
        this.container.appendChild(this.svg);
        
        // Grid settings
        this.gridSize = 50;
        this.components = [];
        this.connections = [];
    }

    // Add a component to the diagram
    addComponent(type, gridX, gridY, options = {}) {
        const x = gridX * this.gridSize;
        const y = gridY * this.gridSize;
        let component;

        switch(type) {
            case 'resistor':
                component = this.schematic.drawResistor(x, y, options.designator, options.value);
                break;
            case 'vcc':
                component = this.schematic.drawVCC(x, y);
                break;
            case 'ground':
                component = this.schematic.drawGround(x, y);
                break;
            default:
                throw new Error(`Unknown component type: ${type}`);
        }

        this.svg.appendChild(component);
        this.components.push({
            type,
            element: component,
            gridX,
            gridY,
            options
        });

        return this.components.length - 1; // Return component index
    }

    // Get the connection point for a component
    getConnectionPoint(component, point = 'top') {
        const x = component.gridX * this.gridSize;
        const y = component.gridY * this.gridSize;
        switch(component.type) {
            case 'resistor':
                if (point === 'top') {
                    return [x, y + 5]; // Start of zigzag (vertical)
                } else if (point === 'bottom') {
                    return [x, y + 35]; // End of zigzag (vertical)
                } else if (point === 'left') {
                    return [x - 20, y + 20]; // Middle left
                } else if (point === 'right') {
                    return [x + 20, y + 20]; // Middle right
                }
                break;
            case 'vcc':
                return [x, y]; // Bottom tip of triangle
            case 'ground':
                return [x, y]; // Topmost ground line
            default:
                return [x, y];
        }
    }

    // Connect two components with a wire, specifying sides
    connectComponents(component1Index, component2Index, side1 = 'bottom', side2 = 'top', label = null) {
        const comp1 = this.components[component1Index];
        const comp2 = this.components[component2Index];
        if (!comp1 || !comp2) {
            throw new Error('Invalid component index');
        }
        const [x1, y1] = this.getConnectionPoint(comp1, side1);
        const [x2, y2] = this.getConnectionPoint(comp2, side2);
        // Draw the wire (straight line for now)
        const wire = this.schematic.drawWire(x1, y1, x2, y2);
        this.svg.appendChild(wire);
        this.connections.push({
            from: component1Index,
            to: component2Index,
            element: wire,
            x1, y1, x2, y2, label
        });
        // Add label if provided
        if (label) {
            this.addLabel((x1 + x2) / 2, (y1 + y2) / 2, label);
        }
    }

    // Add a label at a specific position
    addLabel(x, y, text) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x);
        label.setAttribute('y', y - 5); // Slightly above the wire
        label.setAttribute('font-size', '12px');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = text;
        this.svg.appendChild(label);
    }

    // Clear the diagram
    clear() {
        while (this.svg.firstChild) {
            this.svg.removeChild(this.svg.firstChild);
        }
        this.components = [];
        this.connections = [];
    }

    // Helper to parse section input
    parseSection(sectionStr) {
        const parts = sectionStr.split(',').map(s => s.trim());
        const type = parts.pop().toLowerCase();
        const values = parts;
        return { values, type };
    }

    renderTextDiagram(lines, title = 'Network') {
        while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

        const width = 300;
        const lineHeight = 18;
        const padding = 16;
        const totalLines = 1 + lines.length;
        const height = Math.max(140, padding * 2 + totalLines * lineHeight);

        this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', height);

        const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleText.setAttribute('x', padding);
        titleText.setAttribute('y', padding + lineHeight);
        titleText.setAttribute('font-size', '13px');
        titleText.setAttribute('font-weight', '600');
        titleText.textContent = title;
        this.svg.appendChild(titleText);

        lines.forEach((line, index) => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', padding);
            text.setAttribute('y', padding + lineHeight * (index + 2));
            text.setAttribute('font-size', '12px');
            text.textContent = line;
            this.svg.appendChild(text);
        });
    }

    // Render a section (series or parallel)
    renderSection(section, x, y, isTop) {
        const spacing = 50;
        const parallelSpacing = 60;
        const resistors = [];
        if (section.type === 'series') {
            // Stack vertically
            let currY = y;
            for (let i = 0; i < section.values.length; ++i) {
                const r = this.schematic.drawResistorValue(x, currY, section.values[i], 'vertical');
                this.svg.appendChild(r);
                resistors.push({ x, y: currY });
                // Draw connecting wire to next resistor (except after last)
                if (i < section.values.length - 1) {
                    this.svg.appendChild(this.schematic.drawWire(x, currY + 35, x, currY + 50));
                }
                currY += 50;
            }
            return { start: [x, y], end: [x, y + (section.values.length - 1) * 50 + 35] };
        } else if (section.type === 'parallel') {
            // Stack horizontally between two nodes
            const n = section.values.length;
            const startY = y;
            const startX = x - ((n - 1) * parallelSpacing) / 2;
            const resistorHeight = 35; // Height of vertical resistor
            const wireDown = 10;
            const busOffset = wireDown + resistorHeight + wireDown; // Where the bottom bus should be
            for (let i = 0; i < n; ++i) {
                // Draw vertical wires from bus to resistor
                this.svg.appendChild(this.schematic.drawWire(startX + i * parallelSpacing, startY, startX + i * parallelSpacing, startY + wireDown));
                // Draw resistor vertically
                const r = this.schematic.drawResistorValue(startX + i * parallelSpacing, startY + wireDown, section.values[i], 'vertical');
                this.svg.appendChild(r);
                // Draw vertical wires from resistor to bus (same length as top)
                this.svg.appendChild(this.schematic.drawWire(startX + i * parallelSpacing, startY + wireDown + resistorHeight, startX + i * parallelSpacing, startY + wireDown + resistorHeight + wireDown));
            }
            // Draw top and bottom bus
            this.svg.appendChild(this.schematic.drawWire(startX, startY, startX + (n - 1) * parallelSpacing, startY));
            this.svg.appendChild(this.schematic.drawWire(startX, startY + busOffset, startX + (n - 1) * parallelSpacing, startY + busOffset));
            return { start: [x, startY], end: [x, startY + busOffset] };
        }
    }

    // Render the full custom diagram
    renderCustom(topSectionStr, bottomSectionStr, supplyVoltage, targetVoltage) {
        // Clear SVG
        while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
        
        // Parse sections to calculate required height
        const topSection = this.parseSection(topSectionStr);
        const bottomSection = this.parseSection(bottomSectionStr);
        
        // Calculate height needed for each section
        const getRequiredHeight = (section) => {
            if (section.type === 'series') {
                return section.values.length * 50 + 35; // 50px per resistor + final height
            } else if (section.type === 'parallel') {
                return 35 + 20; // resistor height + wire spacing
            }
            return 50; // default single resistor
        };
        
        const topHeight = getRequiredHeight(topSection);
        const bottomHeight = getRequiredHeight(bottomSection);
        const baseHeight = 30 + 20 + 20 + 10 + 20 + 30; // VCC + wires + junction + ground + margins
        const totalHeight = Math.max(220, baseHeight + topHeight + bottomHeight);
        
        // Update SVG dimensions
        const width = 300;
        // Update viewBox to match content
        this.svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
        // Set width and height to establish intrinsic aspect ratio
        this.svg.setAttribute('width', width);
        this.svg.setAttribute('height', totalHeight);
        
        const centerX = width / 2;
        let currY = 30;
        // V supply
        this.svg.appendChild(this.schematic.drawVCC(centerX, currY, supplyVoltage));
        // Add wire from Vsupply to first resistor
        this.svg.appendChild(this.schematic.drawWire(centerX, currY, centerX, currY + 20));
        currY += 20;
        // Top section
        const topRes = this.renderSection(topSection, centerX, currY, true);
        currY = topRes.end[1] + 20;
        // Junction (circle + horizontal wire)
        const junctionRadius = 4;
        this.svg.appendChild(this.schematic.drawWire(centerX, topRes.end[1], centerX, currY));
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', currY);
        circle.setAttribute('r', junctionRadius);
        circle.setAttribute('stroke', this.schematic.styles.stroke);
        circle.setAttribute('stroke-width', this.schematic.styles.strokeWidth);
        circle.setAttribute('fill', '#000');
        this.svg.appendChild(circle);
        // Horizontal wire (dynamic length)
        const hWireLen = width / 2 - 60;
        this.svg.appendChild(this.schematic.drawWire(centerX, currY, centerX + hWireLen, currY));
        // Add right-aligned Vout label to the end of the horizontal wire
        const voutLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        voutLabel.setAttribute('x', centerX + hWireLen + 30);
        voutLabel.setAttribute('y', currY - 8);
        voutLabel.setAttribute('font-size', '12px');
        voutLabel.setAttribute('text-anchor', 'end');
        voutLabel.textContent = `Vout [${targetVoltage}V]`;
        this.svg.appendChild(voutLabel);
        currY += junctionRadius + 10;
        
        // Add vertical wire from junction to bottom section
        this.svg.appendChild(this.schematic.drawWire(centerX, currY - junctionRadius - 10, centerX, currY));
        
        // Bottom section
        const bottomRes = this.renderSection(bottomSection, centerX, currY, false);
        currY = bottomRes.end[1] + 20;
        // Wire to ground
        this.svg.appendChild(this.schematic.drawWire(centerX, bottomRes.end[1], centerX, currY));
        // Ground
        this.svg.appendChild(this.schematic.drawGround(centerX, currY));
    }
} 
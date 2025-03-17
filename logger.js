const winston = require('winston');

const getLogger = (name) => {
    const myFormat = winston.format.printf(
        ({
            level, message, timestamp, label, ...metadata
        }) => {
            let msg = `${timestamp} [${label}] [${level}] : ${message} `;
            if (metadata) {
                msg += JSON.stringify(metadata);
            }
            return msg;
        },
    );

    const logLevel = 'info';
    const transports = [];

    transports.push(
        new winston.transports.Console({
            level: logLevel,
            timestamp: true,
            label: name,
        }),
    );

    transports.push(
        new winston.transports.File({
            filename: `logs/${name}.log`,
            level: logLevel,
            timestamp: true,
            label: name,
        }),
    );

    // Configure this command logger
    return winston.createLogger({
        transports,
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.splat(),
            winston.format.timestamp(),
            winston.format.label({label: name}),
            myFormat,
        ),
    });
};

module.exports = {getLogger};

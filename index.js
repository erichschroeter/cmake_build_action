const core = require('@actions/core');

const { execFileSync } = require('child_process');
const os = require('os');
const process = require('process');
const path = require('path');
const fs = require('fs');

const Action = require('./action.js');
const Executor = require('./executor.js');
const GroupExecutor = require('./group_executor.js');


const submoduleGroup = 'Submodule update';
const configureGroup = 'Configure build';
const startBuildGroup = 'Start build';
const runTests = "Run unit tests";

const dirName = 'build';
const gitApp = 'git';
const gitParams = ['submodule', 'update', '--init', '--recursive'];

const cmakeApp = 'cmake';
const cmakeVersionParam = '--version';
const cmakeBuildParam = '--build';
const cmakeConfigParam = '--config';
const cmakeParallelParam = '--parallel';
const cmakeSourceDirParam = '..';
const cmakeBuildDirParam = '.';

const ctestApp = 'ctest';
const ctestOutputOnFailure = '--output-on-failure';

const submoduleUpdateInput = 'submodule_update';
const cmakeArgsInput = 'cmake_args';
const runTestsInput = 'run_tests';
const unitTestBuildInput = 'unit_test_build';
const configInput = 'config';

const versionTemplate = /(?!cmake version)(?:\d{1,})/gm;

function submoduleUpdateExecutor()
{
    return new GroupExecutor(submoduleGroup, [new Executor(gitApp, gitParams)]);
}

function cmakeConfigureExecutor()
{
    var buildPath = path.join(process.cwd(), dirName);
    if (!fs.existsSync(buildPath))
    {
        core.info(`Create folder: ${dirName}`);
        fs.mkdirSync(buildPath);
    }

    process.chdir(buildPath);
    core.info(`Build directory: ${process.cwd()}`);

    var configureParameters = [cmakeSourceDirParam];

    const unitTestBuildIn = core.getInput(unitTestBuildInput, { required: false });
    if(unitTestBuildIn.length > 0)
    {
        configureParameters.push(unitTestBuildIn);
    }
    
    const cmakeArgIn = core.getInput(cmakeArgsInput, { required: false });
    for(const arg of cmakeArgIn.split(';'))
    {
        if(arg.length > 0)
        {
            configureParameters.push(arg);
        }
    }

    return new GroupExecutor(configureGroup, [new Executor(cmakeApp, configureParameters)]);
}

function cmakeBuildExecutor()
{
    const configIn = core.getInput(configInput, { required: false });
    let buildParameters = [cmakeBuildParam, cmakeBuildDirParam, cmakeConfigParam, `${configIn}`];
    
    if(cpus > 1)
    {
        const versionText = execFileSync(cmakeApp, [cmakeVersionParam]).toString();
        var version = versionText.match(versionTemplate);
        if(version.length >= 2 && version[0] <= 3 && version[1] > 11)
        {
            buildParameters.push(cmakeParallelParam);
            buildParameters.push(`${cpus}`);
        }
        else
        {
            buildParameters.push('--');
            buildParameters.push(`-j${cpus}`);
        }
    }
    
    return new GroupExecutor(startBuildGroup, [new Executor(cmakeApp, buildParameters)]);
}

function cmakeRunTestsExecutor()
{
    let ctestParameters = [ctestOutputOnFailure, '-j', `${cpus}`]
    return new GroupExecutor(runTests, [new Executor(ctestApp, ctestParameters)]);
}

var cpus = os.cpus().length;

core.info(`CPUs: ${cpus}`);
core.info(`Starting directory:  ${process.cwd()}`);

try 
{
    var action = new Action();

    const submoduleUpdateIn = core.getInput(submoduleUpdateInput, { required: false });
    if(submoduleUpdateIn === 'ON')
    {
        var submoduleUpdate = submoduleUpdateExecutor();
        action.addExecutor(submoduleUpdate);
    }

    var cmakeConfigure = cmakeConfigureExecutor();
    var cmakeBuild = cmakeBuildExecutor();
    action.addExecutor(cmakeConfigure);
    action.addExecutor(cmakeBuild);

    const runTestsIn = core.getInput(runTestsInput, { required: false });
    if(runTestsIn === 'ON')
    {
        var cmakeRunTests = cmakeRunTestsExecutor();
        action.addExecutor(cmakeRunTests);
    }
    
    action.run();
} 
catch (error)
{
    core.setFailed(error.message);
}



'use strict';

const gulp = require('gulp');
const browserify = require('browserify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const rev = require('gulp-rev');
const revCollector = require('gulp-rev-collector');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const stringify = require('stringify');

gulp.task('js', () => {
	return browserify({entries: 'app/main.js', debug: true})
        .transform(stringify(['.html']))
		.bundle()
		.pipe(source('bundle.js'))
        .pipe(buffer())
		.pipe(rev())
		.pipe(gulp.dest('build'))
		.pipe(rev.manifest())
		.pipe(gulp.dest('rev'));
});

gulp.task('html', ['js'], () => {
	return gulp.src(['rev/**/*.json', 'app/**/*.html', '!app/**/*.template.html'])
		.pipe(revCollector())
		.pipe(gulp.dest('build'));
});

gulp.task('css', () => {
	return gulp.src('app/main.css')
		.pipe(gulp.dest('build'));
});

gulp.task('build', ['js', 'css', 'html']);
gulp.task('clean', () => del.sync(['build', 'rev']));

gulp.task('watch', () => {
	gulp.watch('app/**/*', ['build']);
});

gulp.task('default', ['build']);